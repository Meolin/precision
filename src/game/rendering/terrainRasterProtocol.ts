import type { TerrainSmoothingSettings } from './TerrainSmoothingSettings';

export interface TerrainRasterRequest {
  type: 'rasterizeChunk';
  requestId: number;
  generation: number;
  terrainVersion: number;
  settingsRevision: number;
  chunkColumn: number;
  chunkRow: number;
  /** Inclusive chunk-local target origin and dimensions. */
  localX: number;
  localY: number;
  width: number;
  height: number;
  /** Material samples include padding around the target. */
  sampleWidth: number;
  sampleHeight: number;
  samplePadding: number;
  materials: ArrayBuffer;
  settings: TerrainSmoothingSettings;
}

export interface TerrainRasterResult {
  type: 'chunkRasterized';
  requestId: number;
  generation: number;
  terrainVersion: number;
  settingsRevision: number;
  chunkColumn: number;
  chunkRow: number;
  localX: number;
  localY: number;
  width: number;
  height: number;
  bitmap: ImageBitmap;
  scale: number;
  visualUpdateMs: number;
}

export interface TerrainRasterFailure {
  type: 'failed';
  requestId: number;
  generation: number;
  terrainVersion: number;
  settingsRevision: number;
  chunkColumn: number;
  chunkRow: number;
  message: string;
}

export type TerrainRasterResponse = TerrainRasterResult | TerrainRasterFailure;
