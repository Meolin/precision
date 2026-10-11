import type { ProjectileState } from '../ballistics/Projectile';
import type { BodyCollisionCandidate } from '../collision/ProjectileCollisionResult';
import type { EntityId, Vec2 } from '../math/Vec2';
import { inverseInertia, inverseMass, type BodyState } from './Body';
import { wakeBody } from './stepBodies';

export interface BodyImpactEvent {
  type: 'bodyImpact';
  tick: number;
  projectileId: EntityId;
  bodyId: EntityId;
  position: Vec2;
  contactPoint: Vec2;
  normal: Vec2;
  impulseNs: number;
}

/** Inelastic projectile contact; a stopped shell transfers its normal momentum. */
export function resolveProjectileBodyImpact(
  projectile: ProjectileState,
  body: BodyState,
  hit: BodyCollisionCandidate,
  tick: number,
): BodyImpactEvent {
  const arm = {
    x: hit.contactPoint.x - hit.bodyCenterAtContact.x,
    y: hit.contactPoint.y - hit.bodyCenterAtContact.y,
  };
  const cross = arm.x * hit.normal.y - arm.y * hit.normal.x;
  const pointVelocity = {
    x: body.velocity.x - body.angularVelocityRadPerSecond * arm.y,
    y: body.velocity.y + body.angularVelocityRadPerSecond * arm.x,
  };
  const relativeNormal =
    (projectile.velocity.x - pointVelocity.x) * hit.normal.x +
    (projectile.velocity.y - pointVelocity.y) * hit.normal.y;
  const effectiveMass =
    1 / projectile.massKg + inverseMass(body) + cross * cross * inverseInertia(body);
  const impulseNs =
    body.kind === 'dynamic' && relativeNormal < 0 ? -relativeNormal / effectiveMass : 0;
  if (impulseNs > 0) {
    wakeBody(body);
    body.velocity.x -= hit.normal.x * impulseNs * inverseMass(body);
    body.velocity.y -= hit.normal.y * impulseNs * inverseMass(body);
    body.angularVelocityRadPerSecond -= cross * impulseNs * inverseInertia(body);
  }
  return {
    type: 'bodyImpact',
    tick,
    projectileId: projectile.id,
    bodyId: body.id,
    position: { ...hit.position },
    contactPoint: { ...hit.contactPoint },
    normal: { ...hit.normal },
    impulseNs,
  };
}
