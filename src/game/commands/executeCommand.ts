import { createProjectile } from '../ballistics/Projectile';
import type { GameConfig } from '../config/GameConfig';
import type { GameState } from '../core/GameState';
import type { CannonState } from '../entities/Cannon';
import { clamp, toRadians } from '../math/Vec2';
import { resolveWeapon } from '../weapons/WeaponSettings';
import { isWeaponId, weaponDefinitions } from '../weapons/weaponDefinitions';
import type { GameCommand } from './GameCommand';

/** Also used on a detached cannon to preview queued aiming/equipping while paused. */
export function applyCannonCommand(
  cannon: CannonState,
  config: GameConfig,
  command: GameCommand,
): void {
  if (command.cannonId !== cannon.id) return;
  if (command.type === 'setAim') {
    if (Number.isFinite(command.angleRad))
      cannon.angleRad = clamp(
        command.angleRad,
        toRadians(config.cannon.minAngleDeg),
        toRadians(config.cannon.maxAngleDeg),
      );
  } else if (
    command.type === 'setWeapon' &&
    isWeaponId(command.weaponId) &&
    command.weaponId !== cannon.weaponId
  ) {
    cannon.weaponId = command.weaponId;
    cannon.angleRad = toRadians(
      clamp(
        weaponDefinitions[command.weaponId].defaultAngleDeg,
        config.cannon.minAngleDeg,
        config.cannon.maxAngleDeg,
      ),
    );
  }
}

export function executeCommand(state: GameState, config: GameConfig, command: GameCommand): void {
  if (command.cannonId !== state.cannon.id) return;
  if (command.type !== 'fire') applyCannonCommand(state.cannon, config, command);
  else {
    if (state.elapsedSeconds + 1e-9 < state.cannon.nextFireTimeSeconds) return;
    const { weapon } = resolveWeapon(config, state.cannon.weaponId);
    const projectile = createProjectile(state.cannon, config, state.nextEntityId++, state.tick);
    state.cannon.nextFireTimeSeconds = state.elapsedSeconds + weapon.cooldownSeconds;
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
        ...(projectile.penetration ? { penetration: { ...projectile.penetration } } : {}),
        ...(projectile.penetrationState
          ? {
              penetrationState: {
                ...projectile.penetrationState,
                position: { ...projectile.penetrationState.position },
                direction: { ...projectile.penetrationState.direction },
                materialSamples: [...projectile.penetrationState.materialSamples],
              },
            }
          : {}),
      },
    });
  }
}
