import type { GameConfig } from '../config/GameConfig';
import type { UnitState } from '../entities/UnitState';
import { toDegrees } from '../math/Vec2';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import { queryUnitGrounding, refreshUnitGrounding, sampleSurfaceY } from './terrainGrounding';

export function updateUnitMovement(
  unit: UnitState,
  terrain: TerrainGrid,
  config: GameConfig['movement'],
  dt: number,
): void {
  if (!unit.alive || !unit.movement) return;
  refreshUnitGrounding(unit, terrain);
  const movement = unit.movement;
  if (movement.targetX === null || !Number.isFinite(dt) || dt <= 0) return;
  if (movement.speedMetersPerSecond <= 0) {
    movement.targetX = null;
    return;
  }
  let remaining = Math.min(
    Math.abs(movement.targetX - unit.position.x),
    movement.speedMetersPerSecond * dt,
  );
  const direction = Math.sign(movement.targetX - unit.position.x);
  // Visit intermediate columns even at low tick rates or large dt.
  while (remaining > 1e-9) {
    const distance = Math.min(remaining, terrain.cellSizeMeters * 0.5);
    const nextX = unit.position.x + direction * distance;
    const centerOffset = unit.hitbox.offset?.x ?? 0;
    const currentSurface = sampleSurfaceY(terrain, unit.position.x + centerOffset);
    const nextSurface = sampleSurfaceY(terrain, nextX + centerOffset);
    if (currentSurface === null || nextSurface === null) {
      movement.blockedReason = 'noGround';
      movement.targetX = null;
      break;
    }
    movement.slopeAngleDeg = toDegrees(
      Math.atan2(Math.abs(nextSurface - currentSurface), distance),
    );
    if (movement.slopeAngleDeg > config.maxSlopeAngleDeg + 1e-7) {
      movement.blockedReason = 'slope';
      movement.targetX = null;
      break;
    }
    const grounding = queryUnitGrounding(terrain, unit, nextX);
    unit.position = grounding.position;
    movement.grounded = grounding.grounded;
    movement.blockedReason = null;
    remaining -= distance;
  }
  if (movement.targetX !== null && Math.abs(unit.position.x - movement.targetX) <= 1e-9) {
    unit.position.x = movement.targetX;
    movement.targetX = null;
  }
}
