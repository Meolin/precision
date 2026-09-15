import type { EntityId } from '../math/Vec2';
import type { WeaponId } from '../weapons/WeaponDefinition';
import type { MoveUnitCommand } from '../movement/MoveUnitCommand';

/** Data only: the future client/server input boundary. */
export type GameCommand =
  | MoveUnitCommand
  | { type: 'setAim'; cannonId: EntityId; angleRad: number }
  | { type: 'fire'; cannonId: EntityId }
  | { type: 'setWeapon'; cannonId: EntityId; weaponId: WeaponId };
