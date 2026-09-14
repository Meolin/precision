import type { EntityId } from '../math/Vec2';

/** Data only: the future client/server input boundary. */
export type GameCommand =
  { type: 'setAim'; cannonId: EntityId; angleRad: number } | { type: 'fire'; cannonId: EntityId };
