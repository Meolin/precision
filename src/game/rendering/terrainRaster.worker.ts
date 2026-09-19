/// <reference lib="webworker" />

import { TerrainMaterialId } from '../terrain/TerrainMaterialId';
import { terrainMaterialVisuals, type TerrainVisualColor } from './terrainMaterialVisuals';
import type {
  TerrainRasterFailure,
  TerrainRasterRequest,
  TerrainRasterResult,
} from './terrainRasterProtocol';

const worker = self as DedicatedWorkerGlobalScope;

function materialAt(
  materials: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): TerrainMaterialId {
  if (x < 0 || y < 0 || x >= width || y >= height) return TerrainMaterialId.Air;
  return materials[y * width + x] as TerrainMaterialId;
}

function colorAt(
  materials: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): TerrainVisualColor | null {
  const material = materialAt(materials, width, height, x, y);
  if (material === TerrainMaterialId.Air) return null;
  const visual = terrainMaterialVisuals[material];
  const exposed =
    materialAt(materials, width, height, x, y - 1) === TerrainMaterialId.Air ||
    materialAt(materials, width, height, x - 1, y) === TerrainMaterialId.Air ||
    materialAt(materials, width, height, x + 1, y) === TerrainMaterialId.Air;
  if (exposed) return visual.edge;
  return materialAt(materials, width, height, x, y - 3) === TerrainMaterialId.Air
    ? visual.surface
    : visual.body;
}

function buildSourcePixels(request: TerrainRasterRequest): Uint8ClampedArray {
  const materials = new Uint8Array(request.materials);
  const pixels = new Uint8ClampedArray(request.sampleWidth * request.sampleHeight * 4);
  for (let y = 0; y < request.sampleHeight; y++)
    for (let x = 0; x < request.sampleWidth; x++) {
      const material = materialAt(materials, request.sampleWidth, request.sampleHeight, x, y);
      let color = colorAt(materials, request.sampleWidth, request.sampleHeight, x, y);
      if (!color) {
        for (let offsetY = -1; offsetY <= 1 && !color; offsetY++)
          for (let offsetX = -1; offsetX <= 1 && !color; offsetX++)
            color = colorAt(
              materials,
              request.sampleWidth,
              request.sampleHeight,
              x + offsetX,
              y + offsetY,
            );
      }
      const index = (y * request.sampleWidth + x) * 4;
      pixels[index] = color?.[0] ?? 0;
      pixels[index + 1] = color?.[1] ?? 0;
      pixels[index + 2] = color?.[2] ?? 0;
      pixels[index + 3] = material === TerrainMaterialId.Air ? 0 : 255;
    }
  return pixels;
}

function rasterize(request: TerrainRasterRequest): TerrainRasterResult {
  const started = performance.now();
  const scale = request.settings.enabled ? request.settings.quality : 1;
  const source = new OffscreenCanvas(request.sampleWidth, request.sampleHeight);
  const sourceContext = source.getContext('2d');
  if (!sourceContext) throw new Error('Offscreen Canvas 2D is unavailable.');
  const image = sourceContext.createImageData(request.sampleWidth, request.sampleHeight);
  image.data.set(buildSourcePixels(request));
  sourceContext.putImageData(image, 0, 0);

  const canvas = new OffscreenCanvas(request.width * scale, request.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Offscreen Canvas 2D is unavailable.');
  context.imageSmoothingEnabled = request.settings.enabled;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    source,
    request.samplePadding,
    request.samplePadding,
    request.width,
    request.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return {
    type: 'chunkRasterized',
    requestId: request.requestId,
    generation: request.generation,
    terrainVersion: request.terrainVersion,
    settingsRevision: request.settingsRevision,
    chunkColumn: request.chunkColumn,
    chunkRow: request.chunkRow,
    localX: request.localX,
    localY: request.localY,
    width: request.width,
    height: request.height,
    bitmap: canvas.transferToImageBitmap(),
    scale,
    visualUpdateMs: performance.now() - started,
  };
}

worker.onmessage = (event: MessageEvent<TerrainRasterRequest>) => {
  const request = event.data;
  try {
    const result = rasterize(request);
    worker.postMessage(result, [result.bitmap]);
  } catch (error) {
    const failure: TerrainRasterFailure = {
      type: 'failed',
      requestId: request.requestId,
      generation: request.generation,
      terrainVersion: request.terrainVersion,
      settingsRevision: request.settingsRevision,
      chunkColumn: request.chunkColumn,
      chunkRow: request.chunkRow,
      message: error instanceof Error ? error.message : String(error),
    };
    worker.postMessage(failure);
  }
};

export {};
