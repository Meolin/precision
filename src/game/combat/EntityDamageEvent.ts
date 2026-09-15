import type { EntityId, Vec2 } from '../math/Vec2';

export interface EntityDamageEvent {
  type: 'entityDamage';
  tick: number;
  sourceEntityId?: EntityId;
  projectileId?: EntityId;
  targetEntityId: EntityId;
  damage: number;
  kineticEnergyJ: number;
  damageKind?: 'direct' | 'explosion';
  /** Contact/target location captured before terrain damage can move a unit. */
  position?: Vec2;
  velocity?: Vec2;
}
