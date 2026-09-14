import type { GameConfig } from '../config/GameConfig';
import { muzzlePosition, type CannonState } from '../entities/Cannon';
import type { EntityId, Vec2 } from '../math/Vec2';

export interface ProjectileState {
  id: EntityId;
  spawnTick: number;
  position: Vec2;
  previousPosition: Vec2;
  velocity: Vec2;
  radius: number;
  massKg: number;
  lifetimeSeconds: number;
  maxLifetimeSeconds: number;
  alive: boolean;
}

export function createProjectile(
  cannon: CannonState,
  config: GameConfig,
  id: EntityId,
  tick: number,
): ProjectileState {
  const position = muzzlePosition(cannon, config);
  return {
    id,
    spawnTick: tick,
    position,
    previousPosition: { ...position },
    velocity: {
      x: Math.cos(cannon.angleRad) * config.projectile.muzzleVelocity,
      y: -Math.sin(cannon.angleRad) * config.projectile.muzzleVelocity,
    },
    radius: config.projectile.radiusMeters,
    massKg: config.projectile.massKg,
    lifetimeSeconds: 0,
    maxLifetimeSeconds: config.projectile.maxLifetimeSeconds,
    alive: true,
  };
}
