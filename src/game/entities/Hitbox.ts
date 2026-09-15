import type { Vec2 } from '../math/Vec2';

export interface CircleHitbox {
  type: 'circle';
  radiusMeters: number;
  offset?: Vec2;
}

/** Add other shapes to this union when their simulation queries exist. */
export type Hitbox = CircleHitbox;

export function hitboxCenter(position: Vec2, hitbox: Hitbox): Vec2 {
  return {
    x: position.x + (hitbox.offset?.x ?? 0),
    y: position.y + (hitbox.offset?.y ?? 0),
  };
}
