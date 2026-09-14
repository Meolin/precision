import type { GameConfig } from '../config/GameConfig';
import { toRadians, type EntityId, type Vec2 } from '../math/Vec2';
import type { TerrainGrid } from '../terrain/TerrainGrid';

export interface CannonState {
  id: EntityId;
  position: Vec2;
  surfaceY: number;
  angleRad: number;
}

export function spawnCannon(terrain: TerrainGrid, config: GameConfig): CannonState {
  const x = config.world.widthMeters * config.cannon.spawnXFraction;
  const surfaceY = terrain.findSurfaceY(x);
  if (surfaceY === null) throw new Error('Cannon spawn requires solid terrain.');
  return {
    id: 1,
    position: { x, y: surfaceY - config.cannon.mountHeightMeters },
    surfaceY,
    angleRad: toRadians(config.cannon.initialAngleDeg),
  };
}

export function muzzlePosition(cannon: CannonState, config: GameConfig): Vec2 {
  return {
    x: cannon.position.x + Math.cos(cannon.angleRad) * config.cannon.barrelLengthMeters,
    y: cannon.position.y - Math.sin(cannon.angleRad) * config.cannon.barrelLengthMeters,
  };
}
