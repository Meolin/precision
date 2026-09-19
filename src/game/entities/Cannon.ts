import type { GameConfig } from '../config/GameConfig';
import { clamp, toRadians, type Vec2 } from '../math/Vec2';
import type { UnitState } from './UnitState';
import type { InstallationState } from './InstallationState';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import type { WeaponId } from '../weapons/WeaponDefinition';
import { weaponDefinitions } from '../weapons/weaponDefinitions';

export interface CannonState extends UnitState {
  surfaceY: number;
  angleRad: number;
  weaponId: WeaponId;
  nextFireTimeSeconds: number;
}

export function spawnCannon(terrain: TerrainGrid, config: GameConfig): InstallationState {
  const x = config.world.widthMeters * config.cannon.spawnXFraction;
  const surfaceY = terrain.findSurfaceY(x);
  if (surfaceY === null) throw new Error('Cannon spawn requires solid terrain.');
  return {
    id: 1,
    teamId: 1,
    ownerPlayerId: 1,
    kind: 'installation',
    mobilityType: 'stationary',
    installationType: 'basicCannon',
    availableWeaponIds: ['basicCannon', 'mortar', 'heavyPenetrator'],
    orders: [],
    fireControl: { status: 'idle', lastFailure: null, lastSolution: null },
    grounding: { terrainVersion: -1, grounded: true },
    health: { current: 100, max: 100 },
    hitbox: { type: 'circle', radiusMeters: config.cannon.mountHeightMeters },
    alive: true,
    position: { x, y: surfaceY - config.cannon.mountHeightMeters },
    surfaceY,
    angleRad: toRadians(weaponDefinitions.basicCannon.defaultAngleDeg),
    weaponId: 'basicCannon',
    nextFireTimeSeconds: 0,
  };
}

/** Elevation limits apply in both horizontal directions. Angles use +y-up. */
export function clampAimAngle(angleRad: number, config: GameConfig): number {
  angleRad = clamp(angleRad, -Math.PI, Math.PI);
  const left = Math.abs(angleRad) > Math.PI / 2;
  // Preserve in-range right-facing angles bit-for-bit for existing physics fixtures.
  const elevation = left ? (angleRad >= 0 ? Math.PI - angleRad : -Math.PI - angleRad) : angleRad;
  const limited = clamp(
    elevation,
    toRadians(config.cannon.minAngleDeg),
    toRadians(config.cannon.maxAngleDeg),
  );
  return left ? Math.PI - limited : limited;
}

export function muzzlePosition(cannon: CannonState, config: GameConfig): Vec2 {
  return {
    x: cannon.position.x + Math.cos(cannon.angleRad) * config.cannon.barrelLengthMeters,
    y: cannon.position.y - Math.sin(cannon.angleRad) * config.cannon.barrelLengthMeters,
  };
}
