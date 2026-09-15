import { queryEntitiesInRadius } from '../collision/queryEntitiesInRadius';
import type { EntityDamageEvent } from '../combat/EntityDamageEvent';
import type { UnitState } from '../entities/UnitState';
import type { EntityId, Vec2 } from '../math/Vec2';
import type { TerrainDamageEvent } from '../terrain/TerrainDamageEvent';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import { calculateExplosionDamage } from './calculateExplosionDamage';
import { validateExplosionDefinition } from './ExplosionDefinition';
import type { ExplosionEvent } from './ExplosionEvent';
import { isBlastPathOccluded } from './isBlastPathOccluded';

export interface ExplosionEntityResult {
  entityId: EntityId;
  targetPosition: Vec2;
  distanceMeters: number;
  rawDamage: number;
  occluded: boolean;
  finalDamage: number;
}

export interface ExplosionResolution {
  explosion: ExplosionEvent;
  affectedEntities: ExplosionEntityResult[];
  entityDamageEvents: EntityDamageEvent[];
  terrainDamageEvent?: TerrainDamageEvent;
}

/** Transient feedback captured by runtime; never retained in GameState across ticks. */
export interface ExplosionResolvedEvent {
  type: 'explosionResolved';
  tick: number;
  resolution: ExplosionResolution;
  entitiesDamaged: number;
  maxDealt: number;
  removedCells: number;
}

/** Pure resolution: reads units/terrain, returns semantic operations only. */
export function resolveExplosion(
  event: ExplosionEvent,
  entities: readonly UnitState[],
  terrain: TerrainGrid,
): ExplosionResolution {
  const explosion = {
    ...event,
    ...validateExplosionDefinition(event),
    position: { ...event.position },
  };
  const affectedEntities: ExplosionEntityResult[] = [];
  const entityDamageEvents: EntityDamageEvent[] = [];
  for (const candidate of queryEntitiesInRadius(
    explosion.position,
    explosion.radiusMeters,
    entities,
  )) {
    const rawDamage = calculateExplosionDamage(candidate.distanceMeters, explosion);
    const occluded =
      explosion.terrainOcclusionEnabled &&
      isBlastPathOccluded(explosion.position, candidate.targetPosition, terrain);
    const finalDamage = rawDamage * (occluded ? explosion.occludedDamageMultiplier : 1);
    affectedEntities.push({
      entityId: candidate.entityId,
      targetPosition: { ...candidate.targetPosition },
      distanceMeters: candidate.distanceMeters,
      rawDamage,
      occluded,
      finalDamage,
    });
    if (finalDamage <= 0) continue;
    entityDamageEvents.push({
      type: 'entityDamage',
      tick: explosion.tick,
      sourceEntityId: explosion.sourceEntityId,
      projectileId: explosion.sourceProjectileId,
      targetEntityId: candidate.entityId,
      damageKind: 'explosion',
      damage: finalDamage,
      kineticEnergyJ: 0,
      position: { ...candidate.targetPosition },
    });
  }
  return {
    explosion,
    affectedEntities,
    entityDamageEvents,
    ...(explosion.terrainDamageRadiusMeters > 0
      ? {
          terrainDamageEvent: {
            type: 'terrainDamage' as const,
            tick: explosion.tick,
            sourceProjectileId: explosion.sourceProjectileId,
            energyJ: 0,
            operation: {
              type: 'circle' as const,
              center: { ...explosion.position },
              radiusMeters: explosion.terrainDamageRadiusMeters,
            },
          },
        }
      : {}),
  };
}
