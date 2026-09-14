import { normalize, type Vec2 } from '../math/Vec2';
import type { TerrainGrid } from './TerrainGrid';

const smooth = [1, 4, 6, 4, 1] as const;
const derivative = [-1, -2, 0, 2, 1] as const;

/** 5x5 occupancy gradient: Soil and Rock both count as 1; +y is down. */
export function calculateSurfaceNormal(
  terrain: TerrainGrid,
  position: Vec2,
  incomingVelocity: Vec2,
): Vec2 {
  const fallback = { x: -incomingVelocity.x, y: -incomingVelocity.y };
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return normalize(fallback);
  const cell = terrain.worldToCell(position);
  let gx = 0;
  let gy = 0;
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 5; x++) {
      if (!terrain.isSolid(cell.x + x - 2, cell.y + y - 2)) continue;
      gx += derivative[x]! * smooth[y]!;
      gy += derivative[y]! * smooth[x]!;
    }
  return normalize({ x: -gx, y: -gy }, fallback);
}
