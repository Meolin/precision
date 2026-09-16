import type { EntityId, Vec2 } from '../math/Vec2';
import type { WeaponId } from '../weapons/WeaponDefinition';
import type { PlayerId } from '../entities/UnitState';

export interface AttackGroundCommand {
  type: 'attackGround';
  playerId: PlayerId;
  entityIds: EntityId[];
  targetPosition: Vec2;
  queue: boolean;
}

export interface AttackTargetCommand {
  type: 'attackTarget';
  playerId: PlayerId;
  entityIds: EntityId[];
  targetEntityId: EntityId;
  queue: boolean;
}

export interface StopCommand {
  type: 'stop';
  playerId: PlayerId;
  entityIds: EntityId[];
  /** Shift+Stop discards only the active order. */
  queue?: boolean;
}

export interface SetWeaponCommand {
  type: 'setWeapon';
  playerId: PlayerId;
  entityIds: EntityId[];
  weaponId: WeaponId;
}

/** Data only: the future client/server input boundary. */
export type GameCommand =
  | AttackGroundCommand
  | AttackTargetCommand
  | StopCommand
  | SetWeaponCommand
  // Omitted playerId means the local player (1), never the entity's owner.
  | { type: 'setAim'; cannonId: EntityId; angleRad: number; playerId?: PlayerId }
  | { type: 'fire'; cannonId: EntityId; playerId?: PlayerId }
  | { type: 'setWeapon'; cannonId: EntityId; weaponId: WeaponId; playerId?: PlayerId };
