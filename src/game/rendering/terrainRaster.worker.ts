/// <reference lib="webworker" />

import { buildTerrainVisualField } from './terrainVisualField';
import type {
  TerrainRasterFailure,
  TerrainRasterRequest,
  TerrainRasterResult,
} from './terrainRasterProtocol';

const worker = self as DedicatedWorkerGlobalScope;

function build(request: TerrainRasterRequest): TerrainRasterResult {
  const started = performance.now();
  const field = buildTerrainVisualField({
    materials: new Uint8Array(request.materials),
    sampleWidth: request.sampleWidth,
    sampleHeight: request.sampleHeight,
    outputWidth: request.fieldWidth,
    outputHeight: request.fieldHeight,
    samplePadding: request.samplePadding,
    ...(request.surfaceRows ? { surfaceRows: new Float64Array(request.surfaceRows) } : {}),
  });
  return {
    type: 'terrainFieldBuilt',
    requestId: request.requestId,
    generation: request.generation,
    terrainVersion: request.terrainVersion,
    chunkColumn: request.chunkColumn,
    chunkRow: request.chunkRow,
    chunkWidth: request.chunkWidth,
    chunkHeight: request.chunkHeight,
    fieldWidth: request.fieldWidth,
    fieldHeight: request.fieldHeight,
    field: field.buffer as ArrayBuffer,
    fieldBuildMs: performance.now() - started,
    queuedAtMs: request.queuedAtMs,
    retry: request.retry,
  };
}

worker.onmessage = (event: MessageEvent<TerrainRasterRequest>) => {
  const request = event.data;
  try {
    const result = build(request);
    worker.postMessage(result, [result.field]);
  } catch (error) {
    const failure: TerrainRasterFailure = {
      type: 'failed',
      requestId: request.requestId,
      generation: request.generation,
      terrainVersion: request.terrainVersion,
      chunkColumn: request.chunkColumn,
      chunkRow: request.chunkRow,
      queuedAtMs: request.queuedAtMs,
      retry: request.retry,
      message: error instanceof Error ? error.message : String(error),
    };
    worker.postMessage(failure);
  }
};
