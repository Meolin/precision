import type { EntityId, Vec2 } from '../math/Vec2';
import type { ExplosionDefinition } from './ExplosionDefinition';
import { validateExplosionDefinition } from './ExplosionDefinition';

/** A snapshot of impact-time tuning. No persistent explosion entity is needed. */
export interface ExplosionEvent extends ExplosionDefinition {
  type: 'explosion';
  tick: number;
  sourceEntityId?: EntityId;
  sourceProjectileId: EntityId;
  position: Vec2;
}

export function createExplosionEvent(
  impact: { tick: number; projectileId: EntityId; position: Vec2 },
  definition: ExplosionDefinition,
  sourceEntityId?: EntityId,
): ExplosionEvent {
  return {
    ...validateExplosionDefinition(definition),
    type: 'explosion',
    tick: impact.tick,
    sourceEntityId,
    sourceProjectileId: impact.projectileId,
    position: { ...impact.position },
  };
}
