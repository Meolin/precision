import type { UnitState } from '../entities/UnitState';
import { clamp } from '../math/Vec2';
import type { EntityDamageEvent } from './EntityDamageEvent';

export interface HealthChange {
  healthBefore: number;
  healthAfter: number;
  result: 'HIT' | 'DESTROYED';
}

/** Apply semantic damage separately from collision; retain dead units as wrecks. */
export function applyEntityDamage(
  units: UnitState[],
  event: EntityDamageEvent,
): HealthChange | null {
  const target = units.find((unit) => unit.id === event.targetEntityId);
  if (!target?.alive || !Number.isFinite(event.damage) || event.damage < 0) return null;
  const healthBefore = target.health.current;
  target.health.current = clamp(healthBefore - event.damage, 0, target.health.max);
  target.alive = target.health.current > 0;
  if (!target.alive && target.movement) target.movement.targetX = null;
  return {
    healthBefore,
    healthAfter: target.health.current,
    result: target.alive ? 'HIT' : 'DESTROYED',
  };
}
