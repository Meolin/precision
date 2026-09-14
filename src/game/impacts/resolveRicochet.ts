import {
  clamp,
  dot,
  isValidNormal,
  normalize,
  reflectVector,
  toRadians,
  type Vec2,
} from '../math/Vec2';
import type { ImpactContext } from './ImpactContext';
import type { ProjectileRicochetDefinition } from './ProjectileRicochetDefinition';

export type RicochetRejection =
  | 'disabled'
  | 'invalidInput'
  | 'limit'
  | 'speed'
  | 'angle'
  | 'material'
  | 'separating'
  | 'exhausted';
export type RicochetResult =
  | { ricocheted: false; reason: RicochetRejection; impactAngleRad: number }
  | {
      ricocheted: true;
      outgoingVelocity: Vec2;
      initialEnergyJ: number;
      remainingEnergyJ: number;
      energyLostJ: number;
      energyRetention: number;
      impactAngleRad: number;
    };

/** Deterministic material/angle/speed decision, with energy as the source of speed. */
export function resolveRicochet(
  context: ImpactContext,
  definition: ProjectileRicochetDefinition,
  massKg: number,
  ricochetCount: number,
): RicochetResult {
  const { event, material, incomingDirection, surfaceNormal, impactAngleRad } = context;
  const reject = (reason: RicochetRejection): RicochetResult => ({
    ricocheted: false,
    reason,
    impactAngleRad: Number.isFinite(impactAngleRad) ? impactAngleRad : 0,
  });
  if (!definition.enabled) return reject('disabled');
  if (
    ![
      event.velocity.x,
      event.velocity.y,
      event.speed,
      event.kineticEnergyJ,
      massKg,
      impactAngleRad,
      ricochetCount,
      definition.minRicochetAngleDeg,
      definition.minSpeedMetersPerSecond,
      definition.energyRetention,
      definition.maxRicochets,
      material.ricochetFactor,
    ].every(Number.isFinite) ||
    !isValidNormal(event.velocity) ||
    !isValidNormal(event.surfaceNormal) ||
    !isValidNormal(surfaceNormal) ||
    !isValidNormal(incomingDirection) ||
    massKg <= 0 ||
    event.kineticEnergyJ <= 0 ||
    event.speed <= 0 ||
    definition.minRicochetAngleDeg < 0 ||
    definition.minRicochetAngleDeg >= 90 ||
    definition.minSpeedMetersPerSecond <= 0 ||
    definition.energyRetention <= 0 ||
    definition.energyRetention >= 1 ||
    !Number.isInteger(ricochetCount) ||
    ricochetCount < 0 ||
    !Number.isInteger(definition.maxRicochets) ||
    definition.maxRicochets < 0
  )
    return reject('invalidInput');
  if (ricochetCount >= definition.maxRicochets) return reject('limit');
  if (event.speed < definition.minSpeedMetersPerSecond) return reject('speed');
  if (material.ricochetFactor <= 0) return reject('material');
  // Never turn an outgoing overlap into a new bounce back into the terrain.
  if (dot(incomingDirection, surfaceNormal) >= -1e-9) return reject('separating');
  const threshold =
    90 - (90 - definition.minRicochetAngleDeg) * clamp(material.ricochetFactor, 0, 1);
  if (impactAngleRad < toRadians(threshold)) return reject('angle');
  const remainingEnergyJ = event.kineticEnergyJ * definition.energyRetention;
  const speedAfter = Math.sqrt((2 * remainingEnergyJ) / massKg);
  if (!Number.isFinite(speedAfter)) return reject('invalidInput');
  if (speedAfter < definition.minSpeedMetersPerSecond) return reject('exhausted');
  const direction = normalize(reflectVector(incomingDirection, surfaceNormal));
  return {
    ricocheted: true,
    outgoingVelocity: { x: direction.x * speedAfter || 0, y: direction.y * speedAfter || 0 },
    initialEnergyJ: event.kineticEnergyJ,
    remainingEnergyJ,
    energyLostJ: event.kineticEnergyJ - remainingEnergyJ,
    energyRetention: definition.energyRetention,
    impactAngleRad,
  };
}
