export interface UnitMovementState {
  targetX: number | null;
  speedMetersPerSecond: number;
  grounded: boolean;
  slopeAngleDeg: number;
  blockedReason: 'slope' | 'noGround' | null;
  terrainVersion: number;
}

export function createMovementState(speedMetersPerSecond: number): UnitMovementState {
  return {
    targetX: null,
    speedMetersPerSecond,
    grounded: false,
    slopeAngleDeg: 0,
    blockedReason: null,
    terrainVersion: -1,
  };
}
