import type { Vec2 } from '../math/Vec2';
import type { TerrainDamageEvent } from '../terrain/TerrainDamageEvent';
import type { TerrainMaterialId } from '../terrain/TerrainMaterialId';
import type { PenetrationResult } from './PenetrationResult';
import type { ActivePenetrationState } from './PenetrationResult';

interface ImpactResolutionBase {
  materialId: TerrainMaterialId;
  terrainDamageEvents: TerrainDamageEvent[];
  penetration?: PenetrationResult;
  activePenetration?: ActivePenetrationState;
  continuePenetration: boolean;
  finalPosition: Vec2;
  remainingVelocity: Vec2;
  remainingEnergyJ: number;
  penetrationDistanceMeters: number;
  impactAngleRad: number;
  surfaceNormal: Vec2;
  initialEnergyJ: number;
}

export interface StopImpactResolution extends ImpactResolutionBase {
  type: 'stop';
  continuePenetration: false;
}

export interface PenetrationImpactResolution extends ImpactResolutionBase {
  type: 'penetrate';
  continuePenetration: true;
  activePenetration: ActivePenetrationState;
}

export interface RicochetImpactResolution extends ImpactResolutionBase {
  type: 'ricochet';
  continuePenetration: false;
  energyLostJ: number;
  energyRetention: number;
  ricochetCount: number;
}

export type ImpactResolution =
  StopImpactResolution | PenetrationImpactResolution | RicochetImpactResolution;
