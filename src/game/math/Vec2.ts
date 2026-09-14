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
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

/** Validate before normalization; very large finite components are safe too. */
export const isValidNormal = (vector: Vec2): boolean =>
  Number.isFinite(vector.x) &&
  Number.isFinite(vector.y) &&
  Math.max(Math.abs(vector.x), Math.abs(vector.y)) > 1e-12;

export function normalize(vector: Vec2, fallback: Vec2 = { x: 0, y: -1 }): Vec2 {
  const source = isValidNormal(vector)
    ? vector
    : isValidNormal(fallback)
      ? fallback
      : { x: 0, y: -1 };
  const scale = Math.max(Math.abs(source.x), Math.abs(source.y));
  const x = source.x / scale;
  const y = source.y / scale;
  const length = Math.hypot(x, y);
  // Canonical zero keeps event data identical after JSON serialization.
  return { x: x / length || 0, y: y / length || 0 };
}

/** Reflect about a unit normal; reject undefined directions and overflow. */
export function reflectVector(vector: Vec2, normal: Vec2): Vec2 {
  const speed = Math.hypot(vector.x, vector.y);
  if (!isValidNormal(vector) || !isValidNormal(normal) || !Number.isFinite(speed))
    return { x: 0, y: 0 };
  const n = normalize(normal);
  const direction = normalize(vector);
  const projection = 2 * dot(direction, n);
  const reflected = normalize({
    x: direction.x - projection * n.x,
    y: direction.y - projection * n.y,
  });
  return { x: reflected.x * speed || 0, y: reflected.y * speed || 0 };
}
export const lerp = (a: Vec2, b: Vec2, alpha: number): Vec2 => ({
  x: a.x + (b.x - a.x) * alpha,
  y: a.y + (b.y - a.y) * alpha,
});
