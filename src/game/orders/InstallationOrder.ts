import type { EntityId, Vec2 } from '../math/Vec2';

export type InstallationOrder =
  | { type: 'attackGround'; targetPosition: Vec2 }
  | { type: 'attackTarget'; targetEntityId: EntityId };

export interface FireControlState {
  status: 'idle' | 'queued' | 'cooldown' | 'fired' | 'failed';
  lastFailure: 'noBallisticSolution' | 'targetLost' | 'unsupported' | null;
  lastSolution: { angleRad: number; missDistanceMeters: number; flightSeconds: number } | null;
}

export function cloneOrder(order: InstallationOrder): InstallationOrder {
  return order.type === 'attackGround'
    ? { ...order, targetPosition: { ...order.targetPosition } }
    : { ...order };
}
