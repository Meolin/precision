export interface DebugOptions {
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
