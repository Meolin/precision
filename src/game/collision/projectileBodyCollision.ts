import type { ProjectileState } from '../ballistics/Projectile';
import type { BodyState } from '../physics/Body';
import { shapeContact } from '../physics/bodyCollision';
import { lerp } from '../math/Vec2';
import { segmentCircleIntersection } from './segmentCircleIntersection';
import type { BodyCollisionCandidate } from './ProjectileCollisionResult';

/** Projectile and body are swept over the same tick interval. */
export function projectileBodyCollisionCandidates(
  projectile: ProjectileState,
  bodies: readonly BodyState[],
): BodyCollisionCandidate[] {
  const result: BodyCollisionCandidate[] = [];
  const from = projectile.previousPosition;
  const to = projectile.position;
  for (const body of bodies) {
    const bound =
      body.shape.type === 'circle'
        ? body.shape.radius
        : Math.hypot(body.shape.halfWidth, body.shape.halfHeight);
    const margin = bound + projectile.radius;
    if (
      Math.max(from.x, to.x) < Math.min(body.previousPosition.x, body.position.x) - margin ||
      Math.min(from.x, to.x) > Math.max(body.previousPosition.x, body.position.x) + margin ||
      Math.max(from.y, to.y) < Math.min(body.previousPosition.y, body.position.y) - margin ||
      Math.min(from.y, to.y) > Math.max(body.previousPosition.y, body.position.y) + margin
    )
      continue;
    if (body.shape.type === 'circle') {
      const relativeFrom = {
        x: from.x - body.previousPosition.x,
        y: from.y - body.previousPosition.y,
      };
      const relativeTo = { x: to.x - body.position.x, y: to.y - body.position.y };
      const hit = segmentCircleIntersection(
        relativeFrom,
        relativeTo,
        { x: 0, y: 0 },
        body.shape.radius + projectile.radius,
      );
      if (!hit) continue;
      const position = lerp(from, to, hit.fraction);
      const center = lerp(body.previousPosition, body.position, hit.fraction);
      result.push({
        type: 'body',
        bodyId: body.id,
        fraction: hit.fraction,
        position,
        normal: hit.normal,
        contactPoint: {
          x: center.x + hit.normal.x * body.shape.radius,
          y: center.y + hit.normal.y * body.shape.radius,
        },
        bodyCenterAtContact: center,
      });
      continue;
    }
    const dx = to.x - from.x - (body.position.x - body.previousPosition.x);
    const dy = to.y - from.y - (body.position.y - body.previousPosition.y);
    const travel =
      Math.hypot(dx, dy) +
      Math.hypot(body.shape.halfWidth, body.shape.halfHeight) *
        Math.abs(body.rotationRad - body.previousRotationRad);
    const steps = Math.max(1, Math.ceil(travel / Math.max(0.025, projectile.radius * 0.5)));
    const at = (fraction: number) => {
      const point = lerp(from, to, fraction);
      const center = lerp(body.previousPosition, body.position, fraction);
      const angle =
        body.previousRotationRad + (body.rotationRad - body.previousRotationRad) * fraction;
      return {
        point,
        center,
        contact: shapeContact(
          point,
          { type: 'circle' as const, radius: projectile.radius },
          center,
          body.shape,
          0,
          angle,
        ),
      };
    };
    for (let index = 0; index <= steps; index++) {
      const fraction = index / steps;
      if (!at(fraction).contact) continue;
      let low = Math.max(0, (index - 1) / steps);
      let high = fraction;
      if (index > 0)
        for (let iteration = 0; iteration < 8; iteration++) {
          const middle = (low + high) / 2;
          if (at(middle).contact) high = middle;
          else low = middle;
        }
      const { point, center, contact } = at(high);
      if (contact)
        result.push({
          type: 'body',
          bodyId: body.id,
          fraction: high,
          position: point,
          normal: { x: -contact.normal.x, y: -contact.normal.y },
          contactPoint: contact.contactPoint,
          bodyCenterAtContact: center,
        });
      break;
    }
  }
  return result;
}
