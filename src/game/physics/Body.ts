import type { EntityId, Vec2 } from '../math/Vec2';

export type BodyShape =
  { type: 'circle'; radius: number } | { type: 'box'; halfWidth: number; halfHeight: number };

/** Serializable rigid body; angles and angular speed use radians and seconds. */
export interface BodyState {
  id: EntityId;
  kind: 'static' | 'dynamic' | 'kinematic';
  shape: BodyShape;
  massKg: number;
  position: Vec2;
  previousPosition: Vec2;
  velocity: Vec2;
  rotationRad: number;
  previousRotationRad: number;
  angularVelocityRadPerSecond: number;
  friction: number;
  restitution: number;
  sleeping: boolean;
  sleepSeconds: number;
  color: number;
}

export function bodyExtents(body: BodyState): Vec2 {
  if (body.shape.type === 'circle') return { x: body.shape.radius, y: body.shape.radius };
  const cosine = Math.abs(Math.cos(body.rotationRad));
  const sine = Math.abs(Math.sin(body.rotationRad));
  return {
    x: body.shape.halfWidth * cosine + body.shape.halfHeight * sine,
    y: body.shape.halfWidth * sine + body.shape.halfHeight * cosine,
  };
}

export function inverseMass(body: BodyState): number {
  return body.kind === 'dynamic' ? 1 / body.massKg : 0;
}

export function inverseInertia(body: BodyState): number {
  if (body.kind !== 'dynamic') return 0;
  const shape = body.shape;
  const inertia =
    shape.type === 'circle'
      ? 0.5 * body.massKg * shape.radius ** 2
      : (body.massKg * (shape.halfWidth ** 2 + shape.halfHeight ** 2)) / 3;
  return 1 / inertia;
}
