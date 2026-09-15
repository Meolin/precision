import type { UnitState } from '../entities/UnitState';
import type { Vec2 } from '../math/Vec2';
import { clamp } from '../math/Vec2';
import type { TerrainGrid } from '../terrain/TerrainGrid';

/** Interpolate column-center heights so a one-cell stair does not become a
 * vertical slope merely because speed * dt is smaller than one cell. */
export function sampleSurfaceY(terrain: TerrainGrid, x: number): number | null {
  const size = terrain.cellSizeMeters;
  const column = x / size - 0.5;
  const left = Math.floor(column);
  const leftX = (clamp(left, 0, terrain.columns - 1) + 0.5) * size;
  const rightX = (clamp(left + 1, 0, terrain.columns - 1) + 0.5) * size;
  const a = terrain.findSurfaceY(leftX);
  const b = terrain.findSurfaceY(rightX);
  if (a === null || b === null) return null;
  return a + (b - a) * (column - left);
}

export interface GroundingResult {
  position: Vec2;
  surfaceY: number | null;
  grounded: boolean;
}

/** Place the whole simulation circle above the occupied cell rectangles.
 * The footprint envelope corrects side penetration at steps/crater rims. */
export function queryUnitGrounding(
  terrain: TerrainGrid,
  unit: UnitState,
  x: number,
): GroundingResult {
  const size = terrain.cellSizeMeters;
  const radius = unit.hitbox.radiusMeters;
  const offset = unit.hitbox.offset ?? { x: 0, y: 0 };
  const centerX = x + offset.x;
  const surfaceY = terrain.findSurfaceY(centerX);
  let centerY = surfaceY === null ? Infinity : surfaceY - radius;
  const first = Math.max(0, Math.floor((centerX - radius) / size));
  const last = Math.min(terrain.columns - 1, Math.floor((centerX + radius) / size));
  for (let column = first; column <= last; column++) {
    const top = terrain.findSurfaceY((column + 0.5) * size);
    if (top === null) continue;
    const distanceX = Math.abs(centerX - clamp(centerX, column * size, (column + 1) * size));
    if (distanceX > radius) continue;
    const circleDepth = Math.sqrt(Math.max(0, radius * radius - distanceX * distanceX));
    centerY = Math.min(centerY, top - circleDepth);
  }
  const grounded = Number.isFinite(centerY);
  // No rigid body or fall damage. Unsupported units settle at the bottom boundary.
  if (!grounded) centerY = terrain.rows * size - radius;
  else centerY -= size * 1e-5;
  return { position: { x, y: centerY - offset.y }, surfaceY, grounded };
}

export function refreshUnitGrounding(unit: UnitState, terrain: TerrainGrid): void {
  if (!unit.alive || !unit.movement || unit.movement.terrainVersion === terrain.version) return;
  const grounding = queryUnitGrounding(terrain, unit, unit.position.x);
  unit.position = grounding.position;
  unit.movement.grounded = grounding.grounded;
  unit.movement.terrainVersion = terrain.version;
  if (!grounding.grounded) {
    unit.movement.targetX = null;
    unit.movement.blockedReason = 'noGround';
  }
}
