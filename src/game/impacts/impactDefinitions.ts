import type { ImpactDefinition, ImpactDefinitionId } from './ImpactDefinition';

export const impactDefinitions: Readonly<Record<ImpactDefinitionId, ImpactDefinition>> =
  Object.freeze({
    basicImpact: Object.freeze({
      id: 'basicImpact',
      ricochetDamage: Object.freeze({
        enabled: true,
        baseRadiusMeters: 0.16,
        energyScale: 0.001,
        maxRadiusMeters: 0.3,
      }),
      terrainDamage: Object.freeze({
        enabled: true,
        baseRadiusMeters: 0.8,
        energyScale: 0.025,
        maxRadiusMeters: 3,
      }),
    }),
    mortarImpact: Object.freeze({
      id: 'mortarImpact',
      ricochetDamage: Object.freeze({
        enabled: true,
        baseRadiusMeters: 0.16,
        energyScale: 0.001,
        maxRadiusMeters: 0.3,
      }),
      terrainDamage: Object.freeze({
        enabled: true,
        baseRadiusMeters: 1.1,
        energyScale: 0.035,
        maxRadiusMeters: 4.5,
      }),
    }),
    penetratorImpact: Object.freeze({
      id: 'penetratorImpact',
      ricochetDamage: Object.freeze({
        enabled: true,
        baseRadiusMeters: 0.16,
        energyScale: 0.001,
        maxRadiusMeters: 0.25,
      }),
      terrainDamage: Object.freeze({
        enabled: true,
        baseRadiusMeters: 0.35,
        energyScale: 0.001,
        maxRadiusMeters: 0.8,
      }),
      penetrationDamage: Object.freeze({ channelRadiusScale: 1 }),
    }),
  });

export function resolveImpactDefinition(
  id: ImpactDefinitionId,
  overrides?: Partial<ImpactDefinition['terrainDamage']>,
): ImpactDefinition {
  const defaults = impactDefinitions[id];
  const terrainDamage = { ...defaults.terrainDamage, ...overrides };
  terrainDamage.maxRadiusMeters = Math.max(
    terrainDamage.baseRadiusMeters,
    terrainDamage.maxRadiusMeters,
  );
  return { ...defaults, terrainDamage };
}
