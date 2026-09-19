import { createProjectile } from '../ballistics/Projectile';
import type { GameConfig } from '../config/GameConfig';
import type { GameState } from '../core/GameState';
import type { InstallationState } from '../entities/InstallationState';
import { resolveWeapon } from './WeaponSettings';
import { isWeaponId } from './weaponDefinitions';

/** The single spawn/cooldown path shared by manual fire and queued orders. */
export function fireInstallation(
  state: GameState,
  config: GameConfig,
  installation: InstallationState,
): boolean {
  if (
    !installation.alive ||
    installation.health.current <= 0 ||
    !installation.grounding.grounded ||
    !isWeaponId(installation.weaponId) ||
    !installation.availableWeaponIds.includes(installation.weaponId) ||
    state.elapsedSeconds + 1e-9 < installation.nextFireTimeSeconds
  )
    return false;
  const { weapon } = resolveWeapon(config, installation.weaponId);
  const projectile = createProjectile(installation, config, state.nextEntityId++, state.tick);
  installation.nextFireTimeSeconds = state.elapsedSeconds + weapon.cooldownSeconds;
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
      ricochet: { ...projectile.ricochet },
      ...(projectile.penetration ? { penetration: { ...projectile.penetration } } : {}),
    },
  });
  return true;
}
