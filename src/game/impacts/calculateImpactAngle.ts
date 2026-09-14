import { clamp, dot, normalize, type Vec2 } from '../math/Vec2';

/** 0 = frontal, PI/2 = tangent. Angles > PI/2 mean motion away from the surface. */
export function calculateImpactAngle(incomingDirection: Vec2, surfaceNormal: Vec2): number {
  const normal = normalize(surfaceNormal);
  const incoming = normalize(incomingDirection, { x: -normal.x, y: -normal.y });
  return Math.acos(clamp(-dot(incoming, normal), -1, 1));
}
