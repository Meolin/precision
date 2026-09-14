export interface ProjectilePenetrationDefinition {
  readonly enabled: boolean;
  readonly penetrationPower: number;
  readonly penetrationRadiusMeters: number;
  readonly maxPenetrationDistanceMeters: number;
  readonly minimumExitEnergyJ: number;
}
