import type { CannonState } from './Cannon';
import type { PlayerId, UnitState } from './UnitState';
import type { WeaponId } from '../weapons/WeaponDefinition';
import type { FireControlState, InstallationOrder } from '../orders/InstallationOrder';

/** Weapon-bearing ground entity. Support correction never changes its world X. */
export interface InstallationState extends CannonState {
  kind: 'installation';
  mobilityType: 'stationary';
  ownerPlayerId: PlayerId;
  installationType: WeaponId;
  availableWeaponIds: WeaponId[];
  orders: InstallationOrder[];
  fireControl: FireControlState;
  grounding: { terrainVersion: number; grounded: boolean };
}

export function isInstallation(unit: UnitState): unit is InstallationState {
  return unit.kind === 'installation' && 'orders' in unit && 'weaponId' in unit;
}

export function isControllable(unit: UnitState, playerId: PlayerId): boolean {
  return unit.alive && unit.health.current > 0 && unit.ownerPlayerId === playerId;
}
