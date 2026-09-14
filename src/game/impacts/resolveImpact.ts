import { clamp } from '../math/Vec2';
import type { TerrainDamageEvent } from '../terrain/TerrainDamageEvent';
import type { ImpactDefinition } from './ImpactDefinition';
import type { ImpactEvent } from './ImpactEvent';
import type { ProjectileState } from '../ballistics/Projectile';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import type { ImpactResolution } from './ImpactResolution';
import { createActivePenetration } from './resolvePenetration';
import type { ProjectilePenetrationDefinition } from './ProjectilePenetrationDefinition';
import { createImpactContext } from './ImpactContext';
import { resolveRicochet } from './resolveRicochet';
import { separateRicochet } from './ricochetContinuation';

export function penetrationChannelRadius(
  projectileRadius: number,
  cellSizeMeters: number,
  penetration: ProjectilePenetrationDefinition,
  impact: ImpactDefinition,
): number {
  // Cell-center rasterization must clear every cell touched by the projectile disk.
  const clearance = projectileRadius + cellSizeMeters * (Math.SQRT1_2 + 0.001);
  return Math.max(
    clearance,
    penetration.penetrationRadiusMeters * (impact.penetrationDamage?.channelRadiusScale ?? 1),
  );
}

/** Preserve the baseline kinetic crater law exactly. */
export function craterRadius(energyJ: number, damage: ImpactDefinition['terrainDamage']): number {
  return clamp(
    damage.baseRadiusMeters + Math.sqrt(Math.max(0, energyJ)) * damage.energyScale,
    damage.baseRadiusMeters,
    damage.maxRadiusMeters,
  );
}

/** Pure consequence calculation. Terrain owns the eventual mutation. */
export function resolveImpact(
  event: ImpactEvent,
  definition: ImpactDefinition,
  projectile: Pick<
    ProjectileState,
    'massKg' | 'radius' | 'penetration' | 'ricochet' | 'ricochetCount'
  >,
  terrain: TerrainGrid,
): ImpactResolution {
  const context = createImpactContext(event, projectile.radius, terrain);
  const materialId = context.material.id;
  const facts = {
    materialId,
    impactAngleRad: context.impactAngleRad,
    surfaceNormal: { ...context.surfaceNormal },
    initialEnergyJ: event.kineticEnergyJ,
  };
  const ricochet = resolveRicochet(
    context,
    projectile.ricochet,
    projectile.massKg,
    projectile.ricochetCount,
  );
  if (ricochet.ricocheted || ricochet.reason === 'exhausted') {
    const finalPosition = ricochet.ricocheted
      ? separateRicochet(event.position, context.surfaceNormal, projectile.radius, terrain)
      : null;
    const energyLostJ =
      ricochet.ricocheted && finalPosition ? ricochet.energyLostJ : event.kineticEnergyJ;
    const terrainDamageEvents: TerrainDamageEvent[] = [];
    const chip = definition.ricochetDamage;
    if (definition.terrainDamage.enabled && chip?.enabled)
      terrainDamageEvents.push({
        type: 'terrainDamage',
        tick: event.tick,
        sourceProjectileId: event.projectileId,
        operation: {
          type: 'circle',
          center: { ...event.contactPoint },
          radiusMeters: craterRadius(energyLostJ, chip),
        },
        energyJ: energyLostJ,
      });
    if (ricochet.ricocheted && finalPosition)
      return {
        ...facts,
        type: 'ricochet',
        continuePenetration: false,
        terrainDamageEvents,
        finalPosition,
        remainingVelocity: { ...ricochet.outgoingVelocity },
        remainingEnergyJ: ricochet.remainingEnergyJ,
        energyLostJ,
        energyRetention: ricochet.energyRetention,
        ricochetCount: projectile.ricochetCount + 1,
        penetrationDistanceMeters: 0,
      };
    // A candidate bounce with no viable exit speed/clearance stops at the surface.
    return {
      ...facts,
      type: 'stop',
      continuePenetration: false,
      terrainDamageEvents,
      finalPosition: { ...event.position },
      remainingVelocity: { x: 0, y: 0 },
      remainingEnergyJ: 0,
      penetrationDistanceMeters: 0,
    };
  }
  // Read intact material once, then keep traversal state on the projectile. The
  // full path is deliberately not resolved here: one fixed tick may consume only
  // `speed * dt` metres of material.
  const activePenetration = projectile.penetration?.enabled
    ? createActivePenetration({
        entryPosition: event.position,
        velocity: event.velocity,
        initialEnergyJ: event.kineticEnergyJ,
        massKg: projectile.massKg,
        radiusMeters: projectile.radius,
        definition: projectile.penetration,
        terrain,
        incomingDirection: context.incomingDirection,
      })
    : null;
  const penetration = activePenetration
    ? {
        penetrated: false,
        reason: 'inProgress' as const,
        entryPosition: { ...event.position },
        finalPosition: { ...event.position },
        remainingVelocity: { ...event.velocity },
        penetrationDistanceMeters: 0,
        initialEnergyJ: event.kineticEnergyJ,
        remainingEnergyJ: event.kineticEnergyJ,
        traversedSegments: [],
        activeState: {
          ...activePenetration,
          position: { ...activePenetration.position },
          direction: { ...activePenetration.direction },
          materialSamples: [...activePenetration.materialSamples],
        },
      }
    : undefined;
  const terrainDamageEvents: TerrainDamageEvent[] = [];
  // A penetrator keeps only the surface crater here. Its channel is emitted by
  // the active traversal tick by tick; the material trace was captured above.
  if (definition.terrainDamage.enabled)
    terrainDamageEvents.push({
      type: 'terrainDamage',
      tick: event.tick,
      sourceProjectileId: event.projectileId,
      operation: {
        type: 'circle',
        center: { ...event.position },
        radiusMeters: craterRadius(event.kineticEnergyJ, definition.terrainDamage),
      },
      energyJ: event.kineticEnergyJ,
    });
  const common = {
    ...facts,
    terrainDamageEvents,
    ...(penetration ? { penetration } : {}),
  };
  if (activePenetration && projectile.penetration)
    return {
      ...common,
      type: 'penetrate',
      continuePenetration: true,
      activePenetration,
      finalPosition: { ...event.position },
      remainingVelocity: { ...event.velocity },
      remainingEnergyJ: event.kineticEnergyJ,
      penetrationDistanceMeters: 0,
    };
  return {
    ...common,
    type: 'stop',
    continuePenetration: false,
    finalPosition: { ...(penetration?.finalPosition ?? event.position) },
    remainingVelocity: { x: 0, y: 0 },
    remainingEnergyJ: penetration?.remainingEnergyJ ?? 0,
    penetrationDistanceMeters: penetration?.penetrationDistanceMeters ?? 0,
  };
}
