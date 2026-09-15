import type { GameConfig } from '../config/GameConfig';
import { muzzlePosition, type CannonState } from '../entities/Cannon';
import type { EntityId, Vec2 } from '../math/Vec2';
import type { TeamId } from '../entities/UnitState';
import { hitboxCenter } from '../entities/Hitbox';
import type { ImpactDefinitionId } from '../impacts/ImpactDefinition';
import type { WeaponId } from '../weapons/WeaponDefinition';
import { resolveWeapon } from '../weapons/WeaponSettings';
import type { ProjectileDefinition, ProjectileDefinitionId } from './ProjectileDefinition';
import type { ActivePenetrationState } from '../impacts/PenetrationResult';

export interface ProjectileState {
  id: EntityId;
  ownerEntityId: EntityId;
  teamId: TeamId;
  hasExitedOwnerHitbox: boolean;
  spawnTick: number;
  weaponId: WeaponId;
  projectileDefinitionId: ProjectileDefinitionId;
  impactDefinitionId: ImpactDefinitionId;
  position: Vec2;
  previousPosition: Vec2;
  velocity: Vec2;
  radius: number;
  massKg: number;
  gravityScale: number;
  windInfluence: number;
  dragCoefficient: number;
  lifetimeSeconds: number;
  maxLifetimeSeconds: number;
  alive: boolean;
  ricochetCount: number;
  readonly ricochet: ProjectileDefinition['ricochet'];
  readonly penetration?: ProjectileDefinition['penetration'];
  penetrationState?: ActivePenetrationState;
}

export function createProjectile(
  cannon: CannonState,
  config: GameConfig,
  id: EntityId,
  tick: number,
): ProjectileState {
  const position = muzzlePosition(cannon, config);
  const { weapon, projectile } = resolveWeapon(config, cannon.weaponId);
  const center = hitboxCenter(cannon.position, cannon.hitbox);
  return {
    id,
    ownerEntityId: cannon.id,
    teamId: cannon.teamId,
    hasExitedOwnerHitbox:
      Math.hypot(position.x - center.x, position.y - center.y) >
      cannon.hitbox.radiusMeters + projectile.radiusMeters,
    spawnTick: tick,
    weaponId: weapon.id,
    projectileDefinitionId: projectile.id,
    impactDefinitionId: projectile.impactDefinitionId,
    position,
    previousPosition: { ...position },
    velocity: {
      x: Math.cos(cannon.angleRad) * weapon.muzzleVelocity,
      y: -Math.sin(cannon.angleRad) * weapon.muzzleVelocity,
    },
    radius: projectile.radiusMeters,
    massKg: projectile.massKg,
    gravityScale: projectile.gravityScale,
    windInfluence: projectile.windInfluence,
    dragCoefficient: projectile.dragCoefficient,
    lifetimeSeconds: 0,
    maxLifetimeSeconds: projectile.maxLifetimeSeconds,
    alive: true,
    ricochetCount: 0,
    ricochet: { ...projectile.ricochet },
    ...(projectile.penetration ? { penetration: { ...projectile.penetration } } : {}),
  };
}
