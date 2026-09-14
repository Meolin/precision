import type { Vec2 } from '../math/Vec2';

export type TerrainDamageOperation =
  | { type: 'circle'; center: Vec2; radiusMeters: number }
  | { type: 'capsule'; from: Vec2; to: Vec2; radiusMeters: number };
