import { clamp, lerp, type Vec2 } from '../math/Vec2';
import type { TerrainGrid } from './TerrainGrid';
import { calculateSurfaceNormal } from './surfaceNormal';
import { sampleTerrainSegment } from './sampleTerrainSegment';

export interface TerrainHit {
  position: Vec2;
  fraction: number;
  normal: Vec2;
  /** Actual cell contact, distinct from the projectile center in position. */
  contactPoint: Vec2;
}

/** Circle vs occupied cell rectangles, including projectile radius. */
export function circleTouchesTerrain(terrain: TerrainGrid, center: Vec2, radius: number): boolean {
  return findTerrainContactCell(terrain, center, radius) !== null;
}

/** Contact geometry only. The center may still be in Air when the rim hits a cell. */
export function findTerrainContactCell(
  terrain: TerrainGrid,
  center: Vec2,
  radius: number,
): Vec2 | null {
  const size = terrain.cellSizeMeters;
  const min = terrain.worldToCell({ x: center.x - radius, y: center.y - radius });
  const max = terrain.worldToCell({ x: center.x + radius, y: center.y + radius });
  for (let row = Math.max(0, min.y); row <= Math.min(terrain.rows - 1, max.y); row++) {
    for (let col = Math.max(0, min.x); col <= Math.min(terrain.columns - 1, max.x); col++) {
      if (!terrain.isSolid(col, row)) continue;
      const nearestX = clamp(center.x, col * size, (col + 1) * size);
      const nearestY = clamp(center.y, row * size, (row + 1) * size);
      if ((center.x - nearestX) ** 2 + (center.y - nearestY) ** 2 <= radius ** 2)
        return { x: col, y: row };
    }
  }
  return null;
}

/** Swept sampling <= half a cell, then refine the first contact interval. */
export function sweepTerrain(
  terrain: TerrainGrid,
  from: Vec2,
  to: Vec2,
  radius: number,
  debugSamples?: Vec2[],
): TerrainHit | null {
  for (const { position, fraction, previousFraction } of sampleTerrainSegment(
    from,
    to,
    terrain.cellSizeMeters,
  )) {
    if (debugSamples && debugSamples.length < 512) debugSamples.push(position);
    if (!circleTouchesTerrain(terrain, position, radius)) continue;
    let lower = previousFraction;
    let upper = fraction;
    for (let iteration = 0; iteration < 8; iteration++) {
      const middle = (lower + upper) / 2;
      if (circleTouchesTerrain(terrain, lerp(from, to, middle), radius)) upper = middle;
      else lower = middle;
    }
    const center = lerp(from, to, upper);
    const cell = findTerrainContactCell(terrain, center, radius)!;
    const size = terrain.cellSizeMeters;
    const contactPoint = {
      x: clamp(center.x, cell.x * size, (cell.x + 1) * size),
      y: clamp(center.y, cell.y * size, (cell.y + 1) * size),
    };
    return {
      position: center,
      fraction: upper,
      contactPoint,
      normal: calculateSurfaceNormal(
        terrain,
        { x: (cell.x + 0.5) * size, y: (cell.y + 0.5) * size },
        { x: to.x - from.x, y: to.y - from.y },
      ),
    };
  }
  return null;
}
