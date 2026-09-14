import type { EntityId, Vec2 } from '../math/Vec2';

export interface TerrainDamageEvent {
  type: 'terrainDamage';
  tick: number;
  sourceProjectileId: EntityId;
  center: Vec2;
  radiusMeters: number;
  energyJ: number;
}
