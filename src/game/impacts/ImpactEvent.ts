import type { ProjectileState } from '../ballistics/Projectile';
import type { ProjectileDefinitionId } from '../ballistics/ProjectileDefinition';
import { calculateKineticEnergy } from '../ballistics/projectilePhysics';
import type { EntityId, Vec2 } from '../math/Vec2';
import type { TerrainHit } from '../terrain/terrainCollision';
import type { WeaponId } from '../weapons/WeaponDefinition';
import type { ImpactDefinitionId } from './ImpactDefinition';

/** Contact facts only: no crater calculation or terrain mutation. */
export interface ImpactEvent {
  type: 'projectileImpact';
  tick: number;
  projectileId: EntityId;
  weaponId: WeaponId;
  projectileDefinitionId: ProjectileDefinitionId;
  impactDefinitionId: ImpactDefinitionId;
  position: Vec2;
  velocity: Vec2;
  speed: number;
  kineticEnergyJ: number;
  surfaceNormal?: Vec2;
}

export function createImpactEvent(
  projectile: ProjectileState,
  hit: TerrainHit,
  tick: number,
): ImpactEvent {
  return {
    type: 'projectileImpact',
    tick,
    projectileId: projectile.id,
    weaponId: projectile.weaponId,
    projectileDefinitionId: projectile.projectileDefinitionId,
    impactDefinitionId: projectile.impactDefinitionId,
    position: { ...hit.position },
    velocity: { ...projectile.velocity },
    speed: Math.hypot(projectile.velocity.x, projectile.velocity.y),
    kineticEnergyJ: calculateKineticEnergy(projectile.massKg, projectile.velocity),
    ...(hit.normal ? { surfaceNormal: { ...hit.normal } } : {}),
  };
}
