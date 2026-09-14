import type { Vec2 } from '../math/Vec2';
import type { TerrainDamageEvent } from './TerrainDamageEvent';
import type { TerrainGrid } from './TerrainGrid';

export interface TerrainDamageOperation {
  type: 'circle';
  center: Vec2;
  radius: number;
}

export function applyTerrainDamage(
  terrain: TerrainGrid,
  operation: TerrainDamageOperation | TerrainDamageEvent,
): number {
  return terrain.removeCircle(
    operation.center,
    operation.type === 'terrainDamage' ? operation.radiusMeters : operation.radius,
  );
}
