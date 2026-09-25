import { Assets, BufferImageSource, Container, Texture } from 'pixi.js';
import type { TerrainRect } from '../terrain/TerrainChunk';
import { unionTerrainRect } from '../terrain/TerrainChunk';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import { TerrainChunkMesh } from './TerrainChunkMesh';
import type { TerrainSmoothingSettings } from './TerrainSmoothingSettings';
import type { TerrainTextureSettings } from './TerrainTextureSettings';
import { terrainMaterialVisuals } from './terrainMaterialVisuals';
import { TerrainMaterialId } from '../terrain/TerrainMaterialId';
import {
  terrainFieldHaloCells,
  terrainFieldSamplePaddingCells,
  terrainVisualInvalidationPaddingCells,
} from './terrainVisualField';
import type {
  TerrainRasterRequest,
  TerrainRasterResponse,
  TerrainRasterResult,
} from './terrainRasterProtocol';

interface PendingRegion {
  chunkColumn: number;
  chunkRow: number;
  rect: TerrainRect;
  retry: number;
  queuedAtMs: number;
}

interface InFlightRequest {
  key: string;
  region: PendingRegion;
  request: TerrainRasterRequest;
}

export interface TerrainVisualChunk {
  readonly chunkColumn: number;
  readonly chunkRow: number;
  readonly mesh: TerrainChunkMesh;
  readonly fieldTexture: Texture;
  rockTexture: Texture;
}

export interface TerrainVisualMetrics {
  /** Main-thread material-buffer preparation before transferring the worker request. */
  prepareUpdateMs: number;
  /** Worker-only reconstruction cost. */
  workerUpdateMs: number;
  /** Main-thread field publication and resource creation cost. */
  publishUpdateMs: number;
  /** Queue-to-worker-response latency, before publication. */
  workerRoundTripMs: number;
  /** Queue-to-first-render latency for a published terrain field. */
  visualLatencyMs: number;
  updatedChunkCount: number;
  updatedPixelCount: number;
}

const rockVisual =
  terrainMaterialVisuals[TerrainMaterialId.Rock].texture ??
  (() => {
    throw new Error('Rock material texture metadata is missing.');
  })();
const maxWorkerRetries = 2;

/** Chunked GPU adapter. It reads dirty history but never mutates simulation terrain. */
export class TerrainLayer {
  readonly container = new Container();
  readonly metrics: TerrainVisualMetrics = {
    prepareUpdateMs: 0,
    workerUpdateMs: 0,
    publishUpdateMs: 0,
    workerRoundTripMs: 0,
    visualLatencyMs: 0,
    updatedChunkCount: 0,
    updatedPixelCount: 0,
  };

  private readonly worker: Worker;
  private readonly pending = new Map<string, PendingRegion>();
  private readonly visuals = new Map<string, TerrainVisualChunk>();
  private terrain: TerrainGrid | null = null;
  private generation = 0;
  private settings: TerrainSmoothingSettings | null = null;
  private textureSettings: TerrainTextureSettings | null = null;
  private rockTexture = Texture.WHITE;
  private lastScheduledVersion = -1;
  private inFlight: InFlightRequest | null = null;
  private pendingPresentation: number[] = [];
  private requestId = 0;
  private disposed = false;
  private pixelsPerMeter = 1;

  constructor(
    createWorker: () => Worker = () =>
      new Worker(new URL('./terrainRaster.worker.ts', import.meta.url), { type: 'module' }),
    loadRockTexture: () => Promise<Texture> = () => Assets.load<Texture>(rockVisual.assetUrl),
  ) {
    this.worker = createWorker();
    this.worker.onmessage = (event: MessageEvent<TerrainRasterResponse>) => {
      const response = event.data;
      const flight = this.inFlight;
      this.inFlight = null;
      if (!flight || response.requestId !== flight.request.requestId) {
        this.requestNext();
        return;
      }
      if (response.type === 'failed') {
        this.retryOrReport(flight, response.message);
      } else if (!this.isCurrent(response)) {
        // A replacement terrain/settings generation already queued full current chunks.
      } else if (this.pending.has(flight.key)) {
        // Do not publish an intermediate chunk. Merge the entire in-flight dependency region so
        // the next request includes both the old work and every edit that arrived during it.
        this.enqueueRegion({ ...flight.region, retry: 0 });
      } else this.publish(response);
      this.requestNext();
    };
    this.worker.onerror = (event) => {
      const flight = this.inFlight;
      this.inFlight = null;
      if (flight) this.retryOrReport(flight, event.message);
      else console.error(`Terrain field worker failed: ${event.message}`);
      this.requestNext();
    };
    void this.loadRockTexture(loadRockTexture);
  }

  update(
    terrain: TerrainGrid,
    settings: TerrainSmoothingSettings,
    textureSettings: TerrainTextureSettings,
    pixelsPerMeter = 1,
  ): void {
    const replaced = terrain !== this.terrain;
    this.settings = { ...settings };
    this.textureSettings = { ...textureSettings };
    this.pixelsPerMeter = pixelsPerMeter;
    if (replaced) {
      this.terrain = terrain;
      this.generation++;
      this.lastScheduledVersion = terrain.version;
      this.pending.clear();
      this.clearVisuals();
      const queuedAtMs = performance.now();
      for (const chunk of terrain.chunks)
        this.enqueueRegion({
          chunkColumn: chunk.id.column,
          chunkRow: chunk.id.row,
          rect: { minX: 0, minY: 0, maxX: chunk.width - 1, maxY: chunk.height - 1 },
          retry: 0,
          queuedAtMs,
        });
    } else if (terrain.version !== this.lastScheduledVersion) {
      for (const change of terrain.getChangesSince(this.lastScheduledVersion)) {
        if (!change.dirtyRect) continue;
        const padding = terrainVisualInvalidationPaddingCells;
        this.enqueueGlobalRect(
          {
            minX: Math.max(0, change.dirtyRect.minX - padding),
            minY: Math.max(0, change.dirtyRect.minY - padding),
            maxX: Math.min(terrain.columns - 1, change.dirtyRect.maxX + padding),
            maxY: Math.min(terrain.rows - 1, change.dirtyRect.maxY + padding),
          },
          performance.now(),
        );
      }
      this.lastScheduledVersion = terrain.version;
    }
    for (const visual of this.visuals.values()) {
      visual.mesh.setSettings(settings, textureSettings.orientation);
      visual.mesh.setPixelsPerMeter(pixelsPerMeter);
      visual.mesh.setRockTexture(this.rockTexture);
      visual.rockTexture = this.rockTexture;
    }
    this.requestNext();
  }

  getVisualChunks(): readonly TerrainVisualChunk[] {
    return [...this.visuals.values()];
  }

  /** Called from Pixi's post-render runner after fields published this frame are visible. */
  markRendered(): void {
    if (this.pendingPresentation.length === 0) return;
    const renderedAtMs = performance.now();
    const queuedAtMs = this.pendingPresentation.at(-1);
    this.pendingPresentation.length = 0;
    if (queuedAtMs !== undefined) this.metrics.visualLatencyMs = renderedAtMs - queuedAtMs;
  }

  private async loadRockTexture(loadTexture: () => Promise<Texture>): Promise<void> {
    try {
      const texture = await loadTexture();
      if (this.disposed) return;
      texture.source.scaleMode = 'linear';
      texture.source.mipmapFilter = 'linear';
      texture.source.autoGenerateMipmaps = rockVisual.mipmaps;
      texture.source.maxAnisotropy = rockVisual.anisotropy;
      texture.source.addressMode = 'repeat';
      texture.source.update();
      this.rockTexture = texture;
      for (const visual of this.visuals.values()) {
        visual.rockTexture = texture;
        visual.mesh.setRockTexture(texture);
      }
    } catch (error) {
      console.warn(
        `Rock texture could not be loaded; using the material colour fallback. ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private enqueueGlobalRect(rect: TerrainRect, queuedAtMs: number): void {
    const terrain = this.terrain;
    if (!terrain) return;
    const firstColumn = Math.floor(rect.minX / terrain.chunkSizeCells);
    const lastColumn = Math.floor(rect.maxX / terrain.chunkSizeCells);
    const firstRow = Math.floor(rect.minY / terrain.chunkSizeCells);
    const lastRow = Math.floor(rect.maxY / terrain.chunkSizeCells);
    for (let chunkRow = firstRow; chunkRow <= lastRow; chunkRow++)
      for (let chunkColumn = firstColumn; chunkColumn <= lastColumn; chunkColumn++) {
        const chunk = terrain.getChunk({ column: chunkColumn, row: chunkRow });
        if (!chunk) continue;
        this.enqueueRegion({
          chunkColumn,
          chunkRow,
          rect: {
            minX: Math.max(0, rect.minX - chunk.originX),
            minY: Math.max(0, rect.minY - chunk.originY),
            maxX: Math.min(chunk.width - 1, rect.maxX - chunk.originX),
            maxY: Math.min(chunk.height - 1, rect.maxY - chunk.originY),
          },
          retry: 0,
          queuedAtMs,
        });
      }
  }

  private enqueueRegion(region: PendingRegion): void {
    const key = `${region.chunkColumn}:${region.chunkRow}`;
    const current = this.pending.get(key);
    if (current) {
      current.rect = unionTerrainRect(current.rect, region.rect);
      current.queuedAtMs = Math.min(current.queuedAtMs, region.queuedAtMs);
      current.retry = Math.max(current.retry, region.retry);
    } else this.pending.set(key, { ...region, rect: { ...region.rect } });
  }

  private requestNext(): void {
    if (this.disposed || this.inFlight || !this.terrain || !this.settings || !this.textureSettings)
      return;
    const entry = this.pending.entries().next().value as [string, PendingRegion] | undefined;
    if (!entry) return;
    const [key, region] = entry;
    this.pending.delete(key);
    const chunk = this.terrain.getChunk({
      column: region.chunkColumn,
      row: region.chunkRow,
    });
    if (!chunk) return this.requestNext();

    const fieldWidth = chunk.width + terrainFieldHaloCells * 2;
    const fieldHeight = chunk.height + terrainFieldHaloCells * 2;
    const samplePadding = terrainFieldSamplePaddingCells;
    const sampleWidth = fieldWidth + samplePadding * 2;
    const sampleHeight = fieldHeight + samplePadding * 2;
    const preparationStarted = performance.now();
    const materials = new Uint8Array(sampleWidth * sampleHeight);
    const originX = chunk.originX - terrainFieldHaloCells - samplePadding;
    const originY = chunk.originY - terrainFieldHaloCells - samplePadding;
    const initialSurface = this.terrain.initialSurfaceMeters;
    const surfaceRows = initialSurface
      ? Float64Array.from({ length: sampleWidth }, (_, x) => {
          const height = initialSurface[originX + x];
          return height === undefined ? Infinity : height / this.terrain!.cellSizeMeters - originY;
        })
      : undefined;
    for (let y = 0; y < sampleHeight; y++) {
      const worldY = originY + y;
      if (worldY < 0 || worldY >= this.terrain.rows) continue;
      const sourceStart = worldY * this.terrain.columns + Math.max(0, originX);
      const targetStart = y * sampleWidth + Math.max(0, -originX);
      const copyWidth = Math.max(
        0,
        Math.min(sampleWidth - Math.max(0, -originX), this.terrain.columns - Math.max(0, originX)),
      );
      if (copyWidth > 0)
        materials.set(
          this.terrain.cells.subarray(sourceStart, sourceStart + copyWidth),
          targetStart,
        );
    }
    const request: TerrainRasterRequest = {
      type: 'buildTerrainField',
      requestId: ++this.requestId,
      generation: this.generation,
      terrainVersion: this.terrain.version,
      chunkColumn: region.chunkColumn,
      chunkRow: region.chunkRow,
      chunkWidth: chunk.width,
      chunkHeight: chunk.height,
      fieldWidth,
      fieldHeight,
      sampleWidth,
      sampleHeight,
      samplePadding,
      materials: materials.buffer,
      ...(surfaceRows ? { surfaceRows: surfaceRows.buffer } : {}),
      queuedAtMs: region.queuedAtMs,
      retry: region.retry,
    };
    this.metrics.prepareUpdateMs = performance.now() - preparationStarted;
    this.inFlight = { key, region, request };
    this.worker.postMessage(request, [
      request.materials,
      ...(request.surfaceRows ? [request.surfaceRows] : []),
    ]);
  }

  private retryOrReport(flight: InFlightRequest, message: string): void {
    if (flight.request.generation !== this.generation) return;
    if (flight.region.retry < maxWorkerRetries) {
      this.enqueueRegion({ ...flight.region, retry: flight.region.retry + 1 });
      return;
    }
    console.error(`Terrain field worker failed after ${maxWorkerRetries + 1} attempts: ${message}`);
  }

  private isCurrent(response: TerrainRasterResult): boolean {
    return !this.disposed && response.generation === this.generation;
  }

  private publish(result: TerrainRasterResult): void {
    const started = performance.now();
    const terrain = this.terrain;
    const settings = this.settings;
    const textureSettings = this.textureSettings;
    if (!terrain || !settings || !textureSettings) return;
    const chunk = terrain.getChunk({ column: result.chunkColumn, row: result.chunkRow });
    if (!chunk) return;
    const key = `${result.chunkColumn}:${result.chunkRow}`;
    const field = new Uint8Array(result.field);
    let visual = this.visuals.get(key);
    if (
      !visual ||
      visual.fieldTexture.source.pixelWidth !== result.fieldWidth ||
      visual.fieldTexture.source.pixelHeight !== result.fieldHeight
    ) {
      if (visual) this.destroyVisual(key, visual);
      const source = new BufferImageSource({
        resource: field,
        width: result.fieldWidth,
        height: result.fieldHeight,
        format: 'rgba8unorm',
        alphaMode: 'no-premultiply-alpha',
        scaleMode: settings.enabled ? 'linear' : 'nearest',
        autoGenerateMipmaps: false,
        autoGarbageCollect: false,
      });
      const fieldTexture = new Texture({ source, label: `terrain-field-${key}` });
      const mesh = new TerrainChunkMesh({
        fieldTexture,
        rockTexture: this.rockTexture,
        chunkOriginMeters: [
          chunk.originX * terrain.cellSizeMeters,
          chunk.originY * terrain.cellSizeMeters,
        ],
        chunkSizeMeters: [
          chunk.width * terrain.cellSizeMeters,
          chunk.height * terrain.cellSizeMeters,
        ],
        fieldSize: [result.fieldWidth, result.fieldHeight],
        smoothing: settings,
        orientation: textureSettings.orientation,
      });
      mesh.setPixelsPerMeter(this.pixelsPerMeter);
      visual = {
        chunkColumn: chunk.id.column,
        chunkRow: chunk.id.row,
        mesh,
        fieldTexture,
        rockTexture: this.rockTexture,
      };
      this.visuals.set(key, visual);
      this.container.addChild(mesh.view);
    } else {
      const source = visual.fieldTexture.source as BufferImageSource;
      source.resource = field;
      source.update();
      visual.mesh.setSettings(settings, textureSettings.orientation);
    }
    this.metrics.workerUpdateMs = result.fieldBuildMs;
    this.metrics.publishUpdateMs = performance.now() - started;
    this.metrics.workerRoundTripMs = started - result.queuedAtMs;
    this.pendingPresentation.push(result.queuedAtMs);
    this.metrics.updatedChunkCount = 1;
    this.metrics.updatedPixelCount = result.chunkWidth * result.chunkHeight;
  }

  private destroyVisual(key: string, visual: TerrainVisualChunk): void {
    this.visuals.delete(key);
    visual.mesh.destroy();
    visual.fieldTexture.destroy(true);
  }

  private clearVisuals(): void {
    for (const [key, visual] of this.visuals) this.destroyVisual(key, visual);
    this.container.removeChildren();
  }

  destroy(): void {
    this.disposed = true;
    this.worker.terminate();
    this.pending.clear();
    this.inFlight = null;
    this.pendingPresentation = [];
    this.clearVisuals();
    this.container.destroy();
  }
}
