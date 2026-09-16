import type { GameConfig } from '../config/GameConfig';
import type { GameState } from '../core/GameState';
import { clampAimAngle, type CannonState } from '../entities/Cannon';
import { isControllable, isInstallation } from '../entities/InstallationState';
import { toRadians } from '../math/Vec2';
import { cloneOrder, type InstallationOrder } from '../orders/InstallationOrder';
import { fireInstallation } from '../weapons/fireInstallation';
import { isWeaponId, weaponDefinitions } from '../weapons/weaponDefinitions';
import type { GameCommand } from './GameCommand';

/** Also used on a detached cannon to preview queued aiming/equipping while paused. */
export function applyCannonCommand(cannon: CannonState, config: GameConfig, command: GameCommand): void {
  if (!isControllable(cannon, command.playerId ?? 1)) return;
  if ('entityIds' in command ? !command.entityIds.includes(cannon.id) : command.cannonId !== cannon.id)
    return;
  if (command.type === 'setAim' && Number.isFinite(command.angleRad)) {
    cannon.angleRad = clampAimAngle(command.angleRad, config);
  } else if (command.type === 'setWeapon' && isWeaponId(command.weaponId) &&
      command.weaponId !== cannon.weaponId &&
      (!isInstallation(cannon) || cannon.availableWeaponIds.includes(command.weaponId))) {
    const facingLeft = Math.cos(cannon.angleRad) < 0;
    cannon.weaponId = command.weaponId;
    const angle = toRadians(weaponDefinitions[command.weaponId].defaultAngleDeg);
    cannon.angleRad = clampAimAngle(facingLeft ? Math.PI - angle : angle, config);
  }
}

/** A future server must bind playerId to its authenticated session. */
export function executeCommand(state: GameState, config: GameConfig, command: GameCommand): void {
  const playerId = command.playerId ?? 1;
  if (!Number.isInteger(playerId) || playerId <= 0) return;
  const ids = [...new Set('entityIds' in command ? command.entityIds : [command.cannonId])]
    .filter(Number.isInteger).sort((a, b) => a - b);
  for (const id of ids) {
    const installation = state.units.find((unit) => unit.id === id);
    if (!installation || !isInstallation(installation) || !isControllable(installation, playerId)) continue;
    if (command.type === 'stop') {
      if (command.queue) installation.orders.shift();
      else installation.orders.length = 0;
      installation.fireControl.status = installation.orders.length ? 'queued' : 'idle';
      installation.fireControl.lastFailure = null;
      continue;
    }
    if (!isWeaponId(installation.weaponId) || !installation.availableWeaponIds.includes(installation.weaponId)) continue;
    if (command.type === 'setAim' || command.type === 'setWeapon') {
      applyCannonCommand(installation, config, command);
      continue;
    }
    if (command.type === 'fire') {
      installation.orders.length = 0;
      installation.fireControl.lastFailure = null;
      installation.fireControl.status = fireInstallation(state, config, installation) ? 'fired' : 'idle';
      continue;
    }
    let order: InstallationOrder;
    if (command.type === 'attackGround') {
      const { x, y } = command.targetPosition;
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 ||
          x >= config.world.widthMeters || y >= config.world.heightMeters) continue;
      order = { type: 'attackGround', targetPosition: { x, y } };
    } else {
      const target = state.units.find((unit) => unit.id === command.targetEntityId);
      if (!target?.alive || target.health.current <= 0 || target.teamId === installation.teamId ||
          target.ownerPlayerId === playerId) continue;
      order = { type: 'attackTarget', targetEntityId: target.id };
    }
    if (!command.queue) installation.orders.length = 0;
    if (installation.orders.length >= config.rts.maxOrders) continue;
    installation.orders.push(cloneOrder(order));
    installation.fireControl.status = 'queued';
    installation.fireControl.lastFailure = null;
    installation.fireControl.lastSolution = null;
  }
}
