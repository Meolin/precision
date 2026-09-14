import { clamp, lerp, type Vec2 } from '../math/Vec2';
import type { TerrainGrid } from './TerrainGrid';

export interface TerrainHit {
  position: Vec2;
  fraction: number;
  normal?: Vec2;
}

/** Circle vs occupied cell rectangles, including projectile radius. */
export function circleTouchesTerrain(terrain: TerrainGrid, center: Vec2, radius: number): boolean {
  const size = terrain.cellSizeMeters;
  const min = terrain.worldToCell({ x: center.x - radius, y: center.y - radius });
  const max = terrain.worldToCell({ x: center.x + radius, y: center.y + radius });
  for (let row = Math.max(0, min.y); row <= Math.min(terrain.rows - 1, max.y); row++) {
    for (let col = Math.max(0, min.x); col <= Math.min(terrain.columns - 1, max.x); col++) {
      if (!terrain.isSolid(col, row)) continue;
      const nearestX = clamp(center.x, col * size, (col + 1) * size);
      const nearestY = clamp(center.y, row * size, (row + 1) * size);
      if ((center.x - nearestX) ** 2 + (center.y - nearestY) ** 2 <= radius ** 2) return true;
    }
  }
  return false;
}

/** Swept sampling <= half a cell, then refine the first contact interval. */
export function sweepTerrain(
  terrain: TerrainGrid,
  from: Vec2,
  to: Vec2,
  radius: number,
  debugSamples?: Vec2[],
): TerrainHit | null {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / (terrain.cellSizeMeters * 0.5)));
  for (let i = 0; i <= steps; i++) {
    const fraction = i / steps;
    const position = lerp(from, to, fraction);
    if (debugSamples && debugSamples.length < 512) debugSamples.push(position);
    if (!circleTouchesTerrain(terrain, position, radius)) continue;
    let lower = Math.max(0, (i - 1) / steps);
    let upper = fraction;
    for (let iteration = 0; iteration < 8; iteration++) {
      const middle = (lower + upper) / 2;
      if (circleTouchesTerrain(terrain, lerp(from, to, middle), radius)) upper = middle;
      else lower = middle;
    }
    return { position: lerp(from, to, upper), fraction: upper };
  }
  return null;
}
