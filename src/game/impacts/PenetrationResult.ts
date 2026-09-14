import type { Vec2 } from '../math/Vec2';
import type { TerrainMaterialId } from '../terrain/TerrainMaterialId';

export interface ActivePenetrationState {
  position: Vec2;
  direction: Vec2;
  materialId: TerrainMaterialId;
  energyJ: number;
  initialEnergyJ: number;
  distanceMeters: number;
  sampleStepMeters: number;
  materialSamples: TerrainMaterialId[];
  exitDistanceMeters: number;
}

export interface PenetrationSegment {
  materialId: TerrainMaterialId;
  from: Vec2;
  to: Vec2;
  distanceMeters: number;
  energyLostJ: number;
}

/** Transient traversal detail; only summary numbers belong in persistent telemetry. */
export interface PenetrationResult {
  penetrated: boolean;
  reason:
    | 'inProgress'
    | 'exited'
    | 'energy'
    | 'maxDistance'
    | 'sampleLimit'
    | 'invalidInput'
    | 'noContact';
  entryPosition: Vec2;
  finalPosition: Vec2;
  exitPosition?: Vec2;
  remainingVelocity: Vec2;
  penetrationDistanceMeters: number;
  initialEnergyJ: number;
  remainingEnergyJ: number;
  traversedSegments: PenetrationSegment[];
  activeState?: ActivePenetrationState;
}

export interface ActivePenetrationStep {
  status: 'continue' | 'exited' | 'stopped';
  reason: 'inProgress' | 'exited' | 'energy' | 'maxDistance' | 'sampleLimit';
  from: Vec2;
  to: Vec2;
  distanceMeters: number;
  energyLostJ: number;
  remainingEnergyJ: number;
  remainingVelocity: Vec2;
  penetrationDistanceMeters: number;
  materialId: TerrainMaterialId;
}
