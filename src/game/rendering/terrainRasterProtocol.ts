export interface TerrainRasterRequest {
  type: 'buildTerrainField';
  requestId: number;
  generation: number;
  terrainVersion: number;
  chunkColumn: number;
  chunkRow: number;
  chunkWidth: number;
  chunkHeight: number;
  fieldWidth: number;
  fieldHeight: number;
  /** Material samples include the field halo plus reconstruction dependency padding. */
  sampleWidth: number;
  sampleHeight: number;
  samplePadding: number;
  materials: ArrayBuffer;
  /** Fractional surface rows relative to the sample origin, one value per sample column. */
  surfaceRows?: ArrayBuffer;
  queuedAtMs: number;
  retry: number;
}

export interface TerrainRasterResult {
  type: 'terrainFieldBuilt';
  requestId: number;
  generation: number;
  terrainVersion: number;
  chunkColumn: number;
  chunkRow: number;
  chunkWidth: number;
  chunkHeight: number;
  fieldWidth: number;
  fieldHeight: number;
  field: ArrayBuffer;
  fieldBuildMs: number;
  queuedAtMs: number;
  retry: number;
}

export interface TerrainRasterFailure {
  type: 'failed';
  requestId: number;
  generation: number;
  terrainVersion: number;
  chunkColumn: number;
  chunkRow: number;
  message: string;
  queuedAtMs: number;
  retry: number;
}

export type TerrainRasterResponse = TerrainRasterResult | TerrainRasterFailure;
