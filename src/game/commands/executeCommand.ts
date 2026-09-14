import { createProjectile } from '../ballistics/Projectile';
import type { GameConfig } from '../config/GameConfig';
import type { GameState } from '../core/GameState';
import { clamp, toRadians } from '../math/Vec2';
import type { GameCommand } from './GameCommand';

export function executeCommand(state: GameState, config: GameConfig, command: GameCommand): void {
  if (command.cannonId !== state.cannon.id) return;
  if (command.type === 'setAim') {
    if (Number.isFinite(command.angleRad))
      state.cannon.angleRad = clamp(
        command.angleRad,
        toRadians(config.cannon.minAngleDeg),
        toRadians(config.cannon.maxAngleDeg),
      );
  } else if (command.type === 'fire') {
    const projectile = createProjectile(state.cannon, config, state.nextEntityId++, state.tick);
    state.projectiles.push(projectile);
    state.shotsFired++;
    state.events.push({
      type: 'projectileSpawned',
      tick: state.tick,
      projectile: {
        ...projectile,
        position: { ...projectile.position },
        previousPosition: { ...projectile.previousPosition },
        velocity: { ...projectile.velocity },
      },
    });
  }
}
