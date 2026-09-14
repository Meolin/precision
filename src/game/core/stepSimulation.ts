import { advanceProjectile, kineticEnergy } from '../ballistics/projectilePhysics';
import { executeCommand } from '../commands/executeCommand';
import type { GameCommand } from '../commands/GameCommand';
import type { GameConfig } from '../config/GameConfig';
import type { Vec2 } from '../math/Vec2';
import { applyTerrainDamage, craterRadius } from '../terrain/damageTerrain';
import type { GameState, ImpactEvent } from './GameState';

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
    const energyJoules = kineticEnergy(projectile.massKg, projectile.velocity);
    const damage = {
      type: 'circle' as const,
      center: { ...hit.position },
      radius: craterRadius(energyJoules, config.terrain),
    };
    const impact: ImpactEvent = {
      type: 'impact',
      tick: state.tick,
      projectileId: projectile.id,
      position: { ...hit.position },
      energyJoules,
      damage,
      removedCells: applyTerrainDamage(state.terrain, damage),
    };
    state.lastImpact = impact;
    state.events.push(impact);
  }
  state.projectiles = state.projectiles.filter((projectile) => projectile.alive);
  state.tick++;
  state.elapsedSeconds += dt;
}
