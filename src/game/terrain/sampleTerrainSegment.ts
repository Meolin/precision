import { lerp, type Vec2 } from '../math/Vec2';

/** Shared half-cell sampling for projectile contacts and blast visibility. */
export function* sampleTerrainSegment(from: Vec2, to: Vec2, cellSizeMeters: number) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  if (!Number.isFinite(distance) || !Number.isFinite(cellSizeMeters) || cellSizeMeters <= 0) return;
  const steps = Math.max(1, Math.ceil(distance / (cellSizeMeters * 0.5)));
  for (let i = 0; i <= steps; i++) {
    const fraction = i / steps;
    yield {
      position: lerp(from, to, fraction),
      fraction,
      previousFraction: Math.max(0, (i - 1) / steps),
    };
  }
}
