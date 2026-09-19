export interface TerrainRect {
  /** Inclusive cell coordinates. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface TerrainChunkId {
  column: number;
  row: number;
}

/** Packed authoritative occupancy for one independently updateable terrain region. */
export interface TerrainChunk {
  readonly id: TerrainChunkId;
  readonly originX: number;
  readonly originY: number;
  readonly width: number;
  readonly height: number;
  readonly wordsPerRow: number;
  readonly collision: Uint32Array;
  revision: number;
  dirty: boolean;
  /** Inclusive, chunk-local cells changed at any point since construction. */
  dirtyRect?: TerrainRect;
}

export interface TerrainChunkChange {
  readonly id: TerrainChunkId;
  /** Inclusive, chunk-local cells. */
  readonly dirtyRect: TerrainRect;
}

export interface TerrainChangeResult {
  readonly changed: boolean;
  /** Inclusive world-cell bounds. */
  readonly dirtyRect?: TerrainRect;
  readonly affectedChunks: readonly TerrainChunkChange[];
  readonly modifiedPixels: number;
  readonly version: number;
}

export function unionTerrainRect(a: TerrainRect | undefined, b: TerrainRect): TerrainRect {
  if (!a) return { ...b };
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}
