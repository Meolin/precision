export interface DebugOptions {
  trajectory: boolean;
  velocity: boolean;
  impact: boolean;
  grid: boolean;
  samples: boolean;
  penetration: boolean;
  surfaceNormals: boolean;
}
export const defaultDebugOptions: DebugOptions = {
  trajectory: true,
  velocity: false,
  impact: true,
  grid: false,
  samples: false,
  penetration: false,
  surfaceNormals: false,
};
