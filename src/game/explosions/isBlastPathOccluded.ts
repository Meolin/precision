import type { Vec2 } from '../math/Vec2';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import { sampleTerrainSegment } from '../terrain/sampleTerrainSegment';

/** Check intact terrain before this explosion's crater is applied. */
export function isBlastPathOccluded(from: Vec2, to: Vec2, terrain: TerrainGrid): boolean {
  const startCell = terrain.worldToCell(from);
  const epsilon = terrain.cellSizeMeters * 0.001;
  for (const { position } of sampleTerrainSegment(from, to, terrain.cellSizeMeters)) {
    if (Math.hypot(position.x - from.x, position.y - from.y) <= epsilon) continue;
    const cell = terrain.worldToCell(position);
    // Skip the entire source cell, not just the exact start point inside that cell.
    if (cell.x === startCell.x && cell.y === startCell.y) continue;
    if (terrain.isSolid(cell.x, cell.y)) return true;
  }
  return false;
}
