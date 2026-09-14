import { advanceProjectile } from '../ballistics/projectilePhysics';
import { executeCommand } from '../commands/executeCommand';
import type { GameCommand } from '../commands/GameCommand';
import type { GameConfig } from '../config/GameConfig';
import type { Vec2 } from '../math/Vec2';
import { createImpactEvent } from '../impacts/ImpactEvent';
import { resolveImpact } from '../impacts/resolveImpact';
import { applyTerrainDamage } from '../terrain/damageTerrain';
import { resolveImpactDefinition } from '../impacts/impactDefinitions';
import type { GameState } from './GameState';

export function stepSimulation(
  state: GameState,
  config: GameConfig,
  dt: number,
  commands: readonly GameCommand[] = [],
  samples?: Vec2[],
): void {
  state.events = [];
  for (const command of commands) executeCommand(state, config, command);
  for (const projectile of state.projectiles) {
    const hit = advanceProjectile(projectile, state.terrain, config, dt, samples);
    if (!hit) continue;
    const impact = createImpactEvent(projectile, hit, state.tick);
    state.events.push(impact);
    // Resolve with the source weapon, even if another weapon is selected now.
    // Impact overrides apply at contact, matching the original crater controls.
    const definition = resolveImpactDefinition(
      impact.impactDefinitionId,
      config.weaponOverrides[impact.weaponId]?.impact,
    );
    const damage = resolveImpact(impact, definition);
    if (damage) state.events.push(damage);
    // Preserve MVP order: later shells in this tick see earlier craters.
    const removedCells = damage ? applyTerrainDamage(state.terrain, damage) : 0;
    state.lastImpact = { ...impact, craterRadiusMeters: damage?.radiusMeters ?? 0, removedCells };
  }
  state.projectiles = state.projectiles.filter((projectile) => projectile.alive);
  state.tick++;
  state.elapsedSeconds += dt;
}
