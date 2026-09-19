export interface DebugOptions {
  terrainVisual: boolean;
  collisionMask: boolean;
  terrainChunks: boolean;
  terrainDirtyRects: boolean;
  trajectory: boolean;
  velocity: boolean;
  impact: boolean;
  grid: boolean;
  samples: boolean;
  penetration: boolean;
  surfaceNormals: boolean;
  entityHitboxes: boolean;
  explosionRadius: boolean;
  explosionOcclusion: boolean;
}
export const defaultDebugOptions: DebugOptions = {
  terrainVisual: true,
  collisionMask: false,
  terrainChunks: false,
  terrainDirtyRects: false,
  trajectory: true,
  velocity: false,
  impact: true,
  grid: false,
  samples: false,
  penetration: false,
  surfaceNormals: false,
  entityHitboxes: false,
  explosionRadius: true,
  explosionOcclusion: false,
};
