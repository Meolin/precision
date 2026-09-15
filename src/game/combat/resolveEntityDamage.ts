import { clamp } from '../math/Vec2';
import type { EntityDamageDefinition } from './EntityDamageDefinition';
import type { EntityDamageEvent } from './EntityDamageEvent';
import type { EntityImpactEvent } from './EntityImpactEvent';

export function resolveEntityDamage(
  impact: EntityImpactEvent,
  definition: EntityDamageDefinition,
): EntityDamageEvent {
  const energy = Number.isFinite(impact.kineticEnergyJ) ? Math.max(0, impact.kineticEnergyJ) : 0;
  const max = Number.isFinite(definition.maxDamage) ? Math.max(0, definition.maxDamage) : 0;
  const min = Number.isFinite(definition.minDamage) ? clamp(definition.minDamage, 0, max) : 0;
  const scale = Number.isFinite(definition.energyToDamageScale)
    ? Math.max(0, definition.energyToDamageScale)
    : 0;
  return {
    type: 'entityDamage',
    tick: impact.tick,
    sourceEntityId: impact.ownerEntityId,
    projectileId: impact.projectileId,
    targetEntityId: impact.targetEntityId,
    damage: definition.enabled ? clamp(energy * scale, min, max) : 0,
    kineticEnergyJ: energy,
  };
}
