export interface ProjectileRicochetDefinition {
  readonly enabled: boolean;
  readonly minRicochetAngleDeg: number;
  /** Applied both before and after reflection, to prevent slow surface jitter. */
  readonly minSpeedMetersPerSecond: number;
  /** Fraction of kinetic energy retained, strictly between 0 and 1. */
  readonly energyRetention: number;
  readonly maxRicochets: number;
}
