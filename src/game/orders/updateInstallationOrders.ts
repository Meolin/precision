import { solveBallisticAim } from '../ballistics/solveBallisticAim';
import type { GameConfig } from '../config/GameConfig';
import type { GameState } from '../core/GameState';
import { hitboxCenter } from '../entities/Hitbox';
import { isInstallation } from '../entities/InstallationState';
import { fireInstallation } from '../weapons/fireInstallation';

export function updateInstallationOrders(state: GameState, config: GameConfig): void {
  for (const installation of state.units.filter(isInstallation).sort((a, b) => a.id - b.id)) {
    if (!installation.alive || installation.health.current <= 0) {
      installation.orders.length = 0;
      installation.fireControl.status = 'idle';
      continue;
    }
    const order = installation.orders[0];
    if (!order) continue;
    const target = order.type === 'attackTarget'
      ? state.units.find((unit) => unit.id === order.targetEntityId) : undefined;
    if (order.type === 'attackTarget' && (!target?.alive || target.health.current <= 0 ||
        target.teamId === installation.teamId || target.ownerPlayerId === installation.ownerPlayerId)) {
      installation.orders.shift();
      installation.fireControl.status = 'failed';
      installation.fireControl.lastFailure = 'targetLost';
      continue;
    }
    if (state.elapsedSeconds + 1e-9 < installation.nextFireTimeSeconds) {
      installation.fireControl.status = 'cooldown';
      continue;
    }
    if (!installation.grounding.grounded) {
      installation.orders.shift();
      installation.fireControl.status = 'failed';
      installation.fireControl.lastFailure = 'unsupported';
      continue;
    }
    const position = order.type === 'attackGround' ? order.targetPosition : hitboxCenter(target!.position, target!.hitbox);
    const solution = solveBallisticAim(installation, position, state.terrain, config, state.units, target?.id);
    installation.fireControl.lastSolution = solution;
    if (!solution) {
      installation.orders.shift();
      installation.fireControl.status = 'failed';
      installation.fireControl.lastFailure = 'noBallisticSolution';
      continue;
    }
    installation.angleRad = solution.angleRad;
    if (fireInstallation(state, config, installation)) {
      installation.orders.shift();
      installation.fireControl.status = 'fired';
      installation.fireControl.lastFailure = null;
    }
    // At most one order per installation/tick, including zero-cooldown weapons.
  }
}
