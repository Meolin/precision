import { hitboxCenter } from '../entities/Hitbox';
import type { UnitState } from '../entities/UnitState';
import type { EntityId, Vec2 } from '../math/Vec2';

export interface AreaQueryResult {
  entityId: EntityId;
  distanceMeters: number;
  targetPosition: Vec2;
  closestPoint: Vec2;
}

/** O(units), in stable unit order. Distance is measured to the circular hitbox rim. */
export function queryEntitiesInRadius(
  center: Vec2,
  radius: number,
  entities: readonly UnitState[],
): AreaQueryResult[] {
  if (![center.x, center.y, radius].every(Number.isFinite) || radius <= 0) return [];
  const results: AreaQueryResult[] = [];
  for (const entity of entities) {
    if (!entity.alive || entity.health.current <= 0) continue;
    const targetPosition = hitboxCenter(entity.position, entity.hitbox);
    const dx = targetPosition.x - center.x;
    const dy = targetPosition.y - center.y;
    const centerDistance = Math.hypot(dx, dy);
    const distanceMeters = Math.max(0, centerDistance - entity.hitbox.radiusMeters);
    if (!Number.isFinite(distanceMeters) || distanceMeters > radius) continue;
    const fraction = centerDistance > 0 ? distanceMeters / centerDistance : 0;
    results.push({
      entityId: entity.id,
      distanceMeters,
      targetPosition,
      closestPoint: { x: center.x + dx * fraction, y: center.y + dy * fraction },
    });
  }
  return results;
}
