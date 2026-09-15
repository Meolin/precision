import { clamp } from '../math/Vec2';

export interface ExplosionDefinition {
  readonly radiusMeters: number;
  readonly innerRadiusMeters: number;
  readonly maxDamage: number;
  readonly minDamage: number;
  readonly terrainDamageRadiusMeters: number;
  readonly terrainOcclusionEnabled: boolean;
  readonly occludedDamageMultiplier: number;
}

export type ExplosionOverrides = Partial<ExplosionDefinition> & { enabled?: boolean };

/** Mortar defaults; also used when enabling explosions on another weapon in debug UI. */
export const defaultExplosionDefinition: ExplosionDefinition = Object.freeze({
  radiusMeters: 6,
  innerRadiusMeters: 1.5,
  maxDamage: 60,
  minDamage: 5,
  terrainDamageRadiusMeters: 2.8,
  terrainOcclusionEnabled: true,
  occludedDamageMultiplier: 0.25,
});

export function validateExplosionDefinition(input: ExplosionDefinition): ExplosionDefinition {
  const finite = (value: number, max: number) =>
    Number.isFinite(value) ? clamp(value, 0, max) : 0;
  const radiusMeters = finite(input.radiusMeters, 60);
  const maxDamage = finite(input.maxDamage, 1000);
  return {
    radiusMeters,
    innerRadiusMeters: finite(input.innerRadiusMeters, radiusMeters),
    maxDamage,
    minDamage: finite(input.minDamage, maxDamage),
    terrainDamageRadiusMeters: finite(input.terrainDamageRadiusMeters, 20),
    terrainOcclusionEnabled: input.terrainOcclusionEnabled === true,
    occludedDamageMultiplier: finite(input.occludedDamageMultiplier, 1),
  };
}

export function resolveExplosionDefinition(
  defaults?: ExplosionDefinition,
  overrides?: ExplosionOverrides,
): ExplosionDefinition | undefined {
  if (!(overrides?.enabled ?? Boolean(defaults))) return undefined;
  return validateExplosionDefinition({ ...defaultExplosionDefinition, ...defaults, ...overrides });
}
