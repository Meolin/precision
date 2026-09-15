import type { ProjectileState } from '../ballistics/Projectile';
import type { ProjectileDefinitionId } from '../ballistics/ProjectileDefinition';
import { calculateKineticEnergy } from '../ballistics/projectilePhysics';
import type { EntityCollisionCandidate } from '../collision/ProjectileCollisionResult';
import type { TeamId } from '../entities/UnitState';
import type { EntityId, Vec2 } from '../math/Vec2';
import type { WeaponId } from '../weapons/WeaponDefinition';

export interface EntityImpactEvent {
  type: 'entityImpact';
  tick: number;
  projectileId: EntityId;
  projectileDefinitionId: ProjectileDefinitionId;
  weaponId: WeaponId;
  ownerEntityId: EntityId;
  teamId: TeamId;
  targetEntityId: EntityId;
  /** Projectile center at first contact with the expanded hitbox. */
  position: Vec2;
  velocity: Vec2;
  speed: number;
  kineticEnergyJ: number;
  surfaceNormal: Vec2;
}

export function createEntityImpactEvent(
  projectile: ProjectileState,
  hit: EntityCollisionCandidate,
  tick: number,
): EntityImpactEvent {
  return {
    type: 'entityImpact',
    tick,
    projectileId: projectile.id,
    projectileDefinitionId: projectile.projectileDefinitionId,
    weaponId: projectile.weaponId,
    ownerEntityId: projectile.ownerEntityId,
    teamId: projectile.teamId,
    targetEntityId: hit.entityId,
    position: { ...hit.position },
    velocity: { ...projectile.velocity },
    speed: Math.hypot(projectile.velocity.x, projectile.velocity.y),
    kineticEnergyJ: calculateKineticEnergy(projectile.massKg, projectile.velocity),
    surfaceNormal: { ...hit.normal },
  };
}
