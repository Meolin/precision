import type { TerrainDamageEvent } from './TerrainDamageEvent';
import type { TerrainDamageOperation } from './TerrainDamageOperation';
import type { TerrainGrid } from './TerrainGrid';
export type { TerrainDamageOperation } from './TerrainDamageOperation';

export function applyTerrainDamage(
  terrain: TerrainGrid,
  operation: TerrainDamageOperation | TerrainDamageEvent,
): number {
  const damage = operation.type === 'terrainDamage' ? operation.operation : operation;
  return damage.type === 'circle'
    ? terrain.removeCircle(damage.center, damage.radiusMeters)
    : terrain.removeCapsule(damage.from, damage.to, damage.radiusMeters);
}
