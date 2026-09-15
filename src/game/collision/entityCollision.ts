import type { ProjectileState } from '../ballistics/Projectile';
import { hitboxCenter } from '../entities/Hitbox';
import type { UnitState } from '../entities/UnitState';
import type { Vec2 } from '../math/Vec2';
import type { EntityCollisionCandidate } from './ProjectileCollisionResult';
import { segmentCircleIntersection } from './segmentCircleIntersection';

/** Spatial spawn immunity; team membership never filters collisions. */
export function updateOwnerExclusion(
  projectile: ProjectileState,
  units: readonly UnitState[],
): void {
  if (projectile.hasExitedOwnerHitbox) return;
  const owner = units.find((unit) => unit.id === projectile.ownerEntityId && unit.alive);
  if (!owner) {
    projectile.hasExitedOwnerHitbox = true;
    return;
  }
  const center = hitboxCenter(owner.position, owner.hitbox);
  if (
    Math.hypot(projectile.position.x - center.x, projectile.position.y - center.y) >
    owner.hitbox.radiusMeters + projectile.radius
  )
    projectile.hasExitedOwnerHitbox = true;
}

export function entityCollisionCandidates(
  projectile: ProjectileState,
  units: readonly UnitState[],
  from: Vec2,
  to: Vec2,
): EntityCollisionCandidate[] {
  const candidates: EntityCollisionCandidate[] = [];
  for (const unit of units) {
    if (!unit.alive || (unit.id === projectile.ownerEntityId && !projectile.hasExitedOwnerHitbox))
      continue;
    const hit = segmentCircleIntersection(
      from,
      to,
      hitboxCenter(unit.position, unit.hitbox),
      unit.hitbox.radiusMeters + projectile.radius,
    );
    if (hit) candidates.push({ type: 'entity', entityId: unit.id, ...hit });
  }
  return candidates;
}
