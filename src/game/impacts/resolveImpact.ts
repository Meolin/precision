import { clamp } from '../math/Vec2';
import type { TerrainDamageEvent } from '../terrain/TerrainDamageEvent';
import type { ImpactDefinition } from './ImpactDefinition';
import type { ImpactEvent } from './ImpactEvent';

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
): TerrainDamageEvent | null {
  if (!definition.terrainDamage.enabled) return null;
  return {
    type: 'terrainDamage',
    tick: event.tick,
    sourceProjectileId: event.projectileId,
    center: { ...event.position },
    radiusMeters: craterRadius(event.kineticEnergyJ, definition.terrainDamage),
    energyJ: event.kineticEnergyJ,
  };
}
