import type { TerrainDamageEvent } from './TerrainDamageEvent';
import type { TerrainDamageOperation } from './TerrainDamageOperation';
import type { TerrainGrid } from './TerrainGrid';
import { clamp } from '../math/Vec2';
import { minimumRockDensityResistance } from './RockDensityMask';
import { TerrainMaterialId } from './TerrainMaterialId';
import type { TerrainMaterialChange } from './TerrainGrid';
export type { TerrainDamageOperation } from './TerrainDamageOperation';

export function applyTerrainDamage(
  terrain: TerrainGrid,
  operation: TerrainDamageOperation | TerrainDamageEvent,
): number {
  const damage = operation.type === 'terrainDamage' ? operation.operation : operation;
  if (terrain.rockDensityMask) {
    const from = damage.type === 'circle' ? damage.center : damage.from;
    const to = damage.type === 'circle' ? damage.center : damage.to;
    const radius = damage.radiusMeters;
    const minimumRadius = damage.type === 'capsule' ? (damage.minimumRadiusMeters ?? 0) : 0;
    if (![from.x, from.y, to.x, to.y, radius].every(Number.isFinite) || radius <= 0) return 0;
    if (!Number.isFinite(minimumRadius) || minimumRadius < 0) return 0;
    const extent = radius / Math.sqrt(minimumRockDensityResistance);
    const size = terrain.cellSizeMeters;
    const left = Math.max(0, Math.floor((Math.min(from.x, to.x) - extent) / size));
    const right = Math.min(
      terrain.columns - 1,
      Math.floor((Math.max(from.x, to.x) + extent) / size),
    );
    const top = Math.max(0, Math.floor((Math.min(from.y, to.y) - extent) / size));
    const bottom = Math.min(terrain.rows - 1, Math.floor((Math.max(from.y, to.y) + extent) / size));
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy;
    const changes: TerrainMaterialChange[] = [];
    for (let row = top; row <= bottom; row++)
      for (let column = left; column <= right; column++) {
        const material = terrain.getMaterialAtCell(column, row);
        if (material === TerrainMaterialId.Air) continue;
        const position = { x: (column + 0.5) * size, y: (row + 0.5) * size };
        const px = position.x - from.x;
        const py = position.y - from.y;
        const t = lengthSquared > 0 ? clamp((px * dx + py * dy) / lengthSquared, 0, 1) : 0;
        const distanceSquared = (px - t * dx) ** 2 + (py - t * dy) ** 2;
        if (distanceSquared > extent * extent) continue;
        const resistance = terrain.getResistanceMultiplier(position, material);
        if (
          distanceSquared <=
          Math.max((radius * radius) / resistance, Math.min(radius, minimumRadius) ** 2)
        )
          changes.push({ column, row, material: TerrainMaterialId.Air });
      }
    return terrain.applyMaterialChanges(changes).modifiedPixels;
  }
  return damage.type === 'circle'
    ? terrain.removeCircle(damage.center, damage.radiusMeters)
    : terrain.removeCapsule(damage.from, damage.to, damage.radiusMeters);
}
