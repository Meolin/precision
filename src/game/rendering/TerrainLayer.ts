import { Container, Sprite, Texture } from 'pixi.js';
import type { TerrainRect } from '../terrain/TerrainChunk';
import { unionTerrainRect } from '../terrain/TerrainChunk';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import { terrainSmoothingKey, type TerrainSmoothingSettings } from './TerrainSmoothingSettings';
import type {
  TerrainRasterRequest,
  TerrainRasterResponse,
  TerrainRasterResult,
} from './terrainRasterProtocol';

interface PendingRegion {
  chunkColumn: number;
  chunkRow: number;
  rect: TerrainRect;
}

export interface TerrainVisualChunk {
  readonly chunkColumn: number;
  readonly chunkRow: number;
  readonly sprite: Sprite;
  readonly texture: Texture;
}

export interface TerrainVisualMetrics {
  visualUpdateMs: number;
  updatedChunkCount: number;
  updatedPixelCount: number;
}

const samplePadding = 4;

/** Chunked GPU adapter. It reads dirty history but never mutates simulation terrain. */
export class TerrainLayer {
  readonly container = new Container();
  readonly metrics: TerrainVisualMetrics = {
    visualUpdateMs: 0,
    updatedChunkCount: 0,
    updatedPixelCount: 0,
  };

  private readonly worker: Worker;
  private readonly pending = new Map<string, PendingRegion>();
  private readonly visuals = new Map<string, TerrainVisualChunk & { canvas: HTMLCanvasElement }>();
  private terrain: TerrainGrid | null = null;
  private generation = 0;
  private settingsKey = '';
  private settingsRevision = 0;
  private settings: TerrainSmoothingSettings | null = null;
  private lastScheduledVersion = -1;
  private busy = false;
  private requestId = 0;
  private disposed = false;

  constructor(
    createWorker: () => Worker = () =>
      new Worker(new URL('./terrainRaster.worker.ts', import.meta.url), { type: 'module' }),
  ) {
    this.worker = createWorker();
    this.worker.onmessage = (event: MessageEvent<TerrainRasterResponse>) => {
      const response = event.data;
      this.busy = false;
      if (response.type === 'failed') {
        console.error(`Terrain chunk raster failed: ${response.message}`);
      } else if (this.isCurrent(response) && !this.pending.has(this.chunkKey(response))) {
        this.publish(response);
      } else response.bitmap.close();
      this.requestNext();
    };
    this.worker.onerror = (event) => {
      this.busy = false;
      console.error(`Terrain raster worker failed: ${event.message}`);
      this.requestNext();
    };
  }

  update(terrain: TerrainGrid, settings: TerrainSmoothingSettings): void {
    const nextSettingsKey = terrainSmoothingKey(settings);
    const replaced = terrain !== this.terrain;
    const settingsChanged = nextSettingsKey !== this.settingsKey;
    if (replaced || settingsChanged) {
      this.terrain = terrain;
      this.generation++;
      this.settingsKey = nextSettingsKey;
      this.settingsRevision++;
      this.settings = { ...settings };
      this.lastScheduledVersion = terrain.version;
      this.pending.clear();
      this.clearVisuals();
      for (const chunk of terrain.chunks)
        this.enqueue(chunk.id.column, chunk.id.row, {
          minX: 0,
          minY: 0,
          maxX: chunk.width - 1,
          maxY: chunk.height - 1,
        });
    } else if (terrain.version !== this.lastScheduledVersion) {
      for (const change of terrain.getChangesSince(this.lastScheduledVersion)) {
        if (!change.dirtyRect) continue;
        this.enqueueGlobalRect({
          minX: Math.max(0, change.dirtyRect.minX - 1),
          minY: Math.max(0, change.dirtyRect.minY - 1),
          maxX: Math.min(terrain.columns - 1, change.dirtyRect.maxX + 1),
          maxY: Math.min(terrain.rows - 1, change.dirtyRect.maxY + 1),
        });
      }
      this.lastScheduledVersion = terrain.version;
    }
    this.requestNext();
  }

  getVisualChunks(): readonly TerrainVisualChunk[] {
    return [...this.visuals.values()];
  }

  private enqueueGlobalRect(rect: TerrainRect): void {
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
        this.enqueue(chunkColumn, chunkRow, {
          minX: Math.max(0, rect.minX - chunk.originX),
          minY: Math.max(0, rect.minY - chunk.originY),
          maxX: Math.min(chunk.width - 1, rect.maxX - chunk.originX),
          maxY: Math.min(chunk.height - 1, rect.maxY - chunk.originY),
        });
      }
  }

  private enqueue(chunkColumn: number, chunkRow: number, rect: TerrainRect): void {
    const key = `${chunkColumn}:${chunkRow}`;
    const current = this.pending.get(key);
    if (current) current.rect = unionTerrainRect(current.rect, rect);
    else this.pending.set(key, { chunkColumn, chunkRow, rect: { ...rect } });
  }

  private requestNext(): void {
    if (this.disposed || this.busy || !this.terrain || !this.settings) return;
    const entry = this.pending.entries().next().value as [string, PendingRegion] | undefined;
    if (!entry) return;
    const [key, region] = entry;
    this.pending.delete(key);
    const chunk = this.terrain.getChunk({
      column: region.chunkColumn,
      row: region.chunkRow,
    });
    if (!chunk) return;
    const width = region.rect.maxX - region.rect.minX + 1;
    const height = region.rect.maxY - region.rect.minY + 1;
    const sampleWidth = width + samplePadding * 2;
    const sampleHeight = height + samplePadding * 2;
    const materials = new Uint8Array(sampleWidth * sampleHeight);
    const originX = chunk.originX + region.rect.minX - samplePadding;
    const originY = chunk.originY + region.rect.minY - samplePadding;
    for (let y = 0; y < sampleHeight; y++) {
      const worldY = originY + y;
      if (worldY < 0 || worldY >= this.terrain.rows) continue;
      for (let x = 0; x < sampleWidth; x++) {
        const worldX = originX + x;
        if (worldX < 0 || worldX >= this.terrain.columns) continue;
        materials[y * sampleWidth + x] =
          this.terrain.cells[worldY * this.terrain.columns + worldX] ?? 0;
      }
    }
    const request: TerrainRasterRequest = {
      type: 'rasterizeChunk',
      requestId: ++this.requestId,
      generation: this.generation,
      terrainVersion: this.terrain.version,
      settingsRevision: this.settingsRevision,
      chunkColumn: region.chunkColumn,
      chunkRow: region.chunkRow,
      localX: region.rect.minX,
      localY: region.rect.minY,
      width,
      height,
      sampleWidth,
      sampleHeight,
      samplePadding,
      materials: materials.buffer,
      settings: { ...this.settings },
    };
    this.busy = true;
    this.worker.postMessage(request, [request.materials]);
  }

  private isCurrent(response: TerrainRasterResult): boolean {
    return (
      !this.disposed &&
      response.generation === this.generation &&
      response.settingsRevision === this.settingsRevision
    );
  }

  private chunkKey(response: Pick<TerrainRasterResult, 'chunkColumn' | 'chunkRow'>): string {
    return `${response.chunkColumn}:${response.chunkRow}`;
  }

  private publish(result: TerrainRasterResult): void {
    const terrain = this.terrain;
    const settings = this.settings;
    if (!terrain || !settings) {
      result.bitmap.close();
      return;
    }
    const chunk = terrain.getChunk({ column: result.chunkColumn, row: result.chunkRow });
    if (!chunk) {
      result.bitmap.close();
      return;
    }
    const key = this.chunkKey(result);
    let visual = this.visuals.get(key);
    if (!visual || visual.canvas.width !== chunk.width * result.scale) {
      if (visual) {
        this.visuals.delete(key);
        visual.sprite.destroy();
        visual.texture.destroy(true);
      }
      const canvas = document.createElement('canvas');
      canvas.width = chunk.width * result.scale;
      canvas.height = chunk.height * result.scale;
      const texture = Texture.from(canvas, true);
      texture.source.scaleMode = settings.enabled ? 'linear' : 'nearest';
      const sprite = new Sprite(texture);
      sprite.position.set(
        chunk.originX * terrain.cellSizeMeters,
        chunk.originY * terrain.cellSizeMeters,
      );
      sprite.width = chunk.width * terrain.cellSizeMeters;
      sprite.height = chunk.height * terrain.cellSizeMeters;
      visual = {
        chunkColumn: chunk.id.column,
        chunkRow: chunk.id.row,
        sprite,
        texture,
        canvas,
      };
      this.visuals.set(key, visual);
      this.container.addChild(sprite);
    }
    const context = visual.canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable.');
    // The worker returns transparent pixels for newly empty terrain. Clear only this dirty region
    // before source-over; canvas `copy` would also clear the rest of the chunk.
    context.clearRect(
      result.localX * result.scale,
      result.localY * result.scale,
      result.width * result.scale,
      result.height * result.scale,
    );
    context.drawImage(result.bitmap, result.localX * result.scale, result.localY * result.scale);
    result.bitmap.close();
    visual.texture.source.update();
    this.metrics.visualUpdateMs = result.visualUpdateMs;
    this.metrics.updatedChunkCount = 1;
    this.metrics.updatedPixelCount = result.width * result.height;
  }

  private clearVisuals(): void {
    for (const visual of this.visuals.values()) {
      visual.sprite.destroy();
      visual.texture.destroy(true);
    }
    this.visuals.clear();
    this.container.removeChildren();
  }

  destroy(): void {
    this.disposed = true;
    this.worker.terminate();
    this.pending.clear();
    this.clearVisuals();
    this.container.destroy();
  }
}
