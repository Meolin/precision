import type { EntityId } from '../math/Vec2';
import type { TerrainDamageOperation } from './TerrainDamageOperation';

export interface TerrainDamageEvent {
  type: 'terrainDamage';
  tick: number;
  sourceProjectileId: EntityId;
  operation: TerrainDamageOperation;
  energyJ: number;
}
