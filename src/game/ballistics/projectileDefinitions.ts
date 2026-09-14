import type { ProjectileDefinition, ProjectileDefinitionId } from './ProjectileDefinition';

export const projectileDefinitions: Readonly<Record<ProjectileDefinitionId, ProjectileDefinition>> =
  Object.freeze({
    basicShell: Object.freeze({
      id: 'basicShell',
      name: 'Basic Shell',
      massKg: 5,
      radiusMeters: 0.12,
      gravityScale: 1,
      windInfluence: 1,
      dragCoefficient: 1,
      maxLifetimeSeconds: 20,
      impactDefinitionId: 'basicImpact',
    }),
    mortarShell: Object.freeze({
      id: 'mortarShell',
      name: 'Mortar Shell',
      massKg: 9,
      radiusMeters: 0.18,
      gravityScale: 1,
      windInfluence: 1,
      dragCoefficient: 1,
      maxLifetimeSeconds: 20,
      impactDefinitionId: 'mortarImpact',
    }),
  });
