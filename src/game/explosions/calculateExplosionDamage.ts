import { validateExplosionDefinition, type ExplosionDefinition } from './ExplosionDefinition';

export function calculateExplosionDamage(
  distanceMeters: number,
  definition: ExplosionDefinition,
): number {
  const { radiusMeters, innerRadiusMeters, maxDamage, minDamage } =
    validateExplosionDefinition(definition);
  // Outer boundary wins when inner == outer; zero radius never damages anything.
  if (!Number.isFinite(distanceMeters) || distanceMeters >= radiusMeters || radiusMeters <= 0)
    return 0;
  if (distanceMeters <= innerRadiusMeters) return maxDamage;
  const t = (distanceMeters - innerRadiusMeters) / (radiusMeters - innerRadiusMeters);
  return maxDamage + (minDamage - maxDamage) * t;
}
