export interface Vec2 {
  x: number;
  y: number;
}
export type EntityId = number;
export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
export const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
export const toDegrees = (radians: number): number => (radians * 180) / Math.PI;
export const lengthSquared = (vector: Vec2): number => vector.x ** 2 + vector.y ** 2;
export const lerp = (a: Vec2, b: Vec2, alpha: number): Vec2 => ({
  x: a.x + (b.x - a.x) * alpha,
  y: a.y + (b.y - a.y) * alpha,
});
