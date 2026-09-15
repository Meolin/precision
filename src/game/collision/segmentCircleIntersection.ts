import { clamp, dot, lerp, normalize, type Vec2 } from '../math/Vec2';

export interface SegmentIntersection {
  fraction: number;
  position: Vec2;
  normal: Vec2;
}

/** Earliest entry, including tangency and an overlapping/zero-length start. */
export function segmentCircleIntersection(
  from: Vec2,
  to: Vec2,
  center: Vec2,
  radius: number,
): SegmentIntersection | null {
  if (
    ![from.x, from.y, to.x, to.y, center.x, center.y, radius].every(Number.isFinite) ||
    radius < 0
  )
    return null;
  const direction = { x: to.x - from.x, y: to.y - from.y };
  const offset = { x: from.x - center.x, y: from.y - center.y };
  const a = dot(direction, direction);
  const c = dot(offset, offset) - radius * radius;
  let fraction = 0;
  if (c > 0) {
    if (a <= 1e-24) return null;
    const b = dot(offset, direction);
    if (b >= 0) return null;
    const discriminant = b * b - a * c;
    const tolerance = Number.EPSILON * 8 * Math.max(b * b, a * c, 1);
    if (discriminant < -tolerance) return null;
    // This form avoids cancellation for starts very close to the circle.
    fraction = c / (-b + Math.sqrt(Math.max(0, discriminant)));
    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) return null;
  }
  const position = lerp(from, to, clamp(fraction, 0, 1));
  return {
    fraction,
    position,
    normal: normalize(
      { x: position.x - center.x, y: position.y - center.y },
      { x: -direction.x, y: -direction.y },
    ),
  };
}
