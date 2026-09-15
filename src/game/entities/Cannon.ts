import type { GameConfig } from '../config/GameConfig';
import { toRadians, type Vec2 } from '../math/Vec2';
import type { UnitState } from './UnitState';
import { createMovementState } from '../movement/UnitMovementState';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import type { WeaponId } from '../weapons/WeaponDefinition';
import { weaponDefinitions } from '../weapons/weaponDefinitions';

export interface CannonState extends UnitState {
  surfaceY: number;
  angleRad: number;
  weaponId: WeaponId;
  nextFireTimeSeconds: number;
}

export function spawnCannon(terrain: TerrainGrid, config: GameConfig): CannonState {
  const x = config.world.widthMeters * config.cannon.spawnXFraction;
  const surfaceY = terrain.findSurfaceY(x);
  if (surfaceY === null) throw new Error('Cannon spawn requires solid terrain.');
  return {
    id: 1,
    teamId: 1,
    health: { current: 100, max: 100 },
    hitbox: { type: 'circle', radiusMeters: config.cannon.mountHeightMeters },
    alive: true,
    movement: createMovementState(config.movement.speedMetersPerSecond),
    position: { x, y: surfaceY - config.cannon.mountHeightMeters },
    surfaceY,
    angleRad: toRadians(weaponDefinitions.basicCannon.defaultAngleDeg),
    weaponId: 'basicCannon',
    nextFireTimeSeconds: 0,
  };
}

export function muzzlePosition(cannon: CannonState, config: GameConfig): Vec2 {
  return {
    x: cannon.position.x + Math.cos(cannon.angleRad) * config.cannon.barrelLengthMeters,
    y: cannon.position.y - Math.sin(cannon.angleRad) * config.cannon.barrelLengthMeters,
  };
}
