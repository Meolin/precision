import type { Vec2 } from '../math/Vec2';
import type { TerrainDamageEvent } from '../terrain/TerrainDamageEvent';
import type { TerrainMaterialId } from '../terrain/TerrainMaterialId';
import type { PenetrationResult } from './PenetrationResult';
import type { ActivePenetrationState } from './PenetrationResult';

export interface ImpactResolution {
  materialId: TerrainMaterialId;
  terrainDamageEvents: TerrainDamageEvent[];
  penetration?: PenetrationResult;
  activePenetration?: ActivePenetrationState;
  type: 'stop' | 'penetrate';
  continuePenetration: boolean;
  finalPosition: Vec2;
  remainingVelocity: Vec2;
  remainingEnergyJ: number;
  penetrationDistanceMeters: number;
}
