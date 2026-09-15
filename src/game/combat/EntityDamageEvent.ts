import type { EntityId } from '../math/Vec2';

export interface EntityDamageEvent {
  type: 'entityDamage';
  tick: number;
  sourceEntityId?: EntityId;
  projectileId?: EntityId;
  targetEntityId: EntityId;
  damage: number;
  kineticEnergyJ: number;
}
