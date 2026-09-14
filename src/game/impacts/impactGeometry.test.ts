import { describe, expect, it } from 'vitest';
import { normalize, reflectVector, toDegrees } from '../math/Vec2';
import { calculateImpactAngle } from './calculateImpactAngle';

describe('impact angle and reflection', () => {
  it('uses 0 degrees frontal and 90 degrees tangential, independent of vector length', () => {
    expect(calculateImpactAngle({ x: 0, y: 20 }, { x: 0, y: -2 })).toBe(0);
    expect(toDegrees(calculateImpactAngle({ x: 20, y: 0 }, { x: 0, y: -1 }))).toBeCloseTo(90);
    expect(toDegrees(calculateImpactAngle({ x: 1, y: 1 }, { x: 0, y: -1 }))).toBeCloseTo(45);
    expect(toDegrees(calculateImpactAngle({ x: 0, y: -1 }, { x: 0, y: -1 }))).toBe(180);
  });

  it('mirrors velocity on floors, walls and slopes without changing speed', () => {
    const floor = reflectVector({ x: 1, y: 1 }, { x: 0, y: -1 });
    expect(floor.x).toBeCloseTo(1);
    expect(floor.y).toBeCloseTo(-1);
    const wall = reflectVector({ x: 3, y: 4 }, { x: -1, y: 0 });
    expect(wall.x).toBeCloseTo(-3);
    expect(wall.y).toBeCloseTo(4);
    const slope = reflectVector({ x: 0, y: 10 }, normalize({ x: 1, y: -1 }));
    expect(slope.x).toBeCloseTo(10);
    expect(slope.y).toBeCloseTo(0);
    expect(Math.hypot(slope.x, slope.y)).toBeCloseTo(10);
  });

  it.each([
    { x: 0, y: 0 },
    { x: NaN, y: 0 },
    { x: Infinity, y: -Infinity },
    { x: 1e308, y: 1e308 },
  ])('protects vector and acos calculations for %j', (vector) => {
    const normal = normalize(vector);
    expect(Math.hypot(normal.x, normal.y)).toBeCloseTo(1);
    expect(Number.isFinite(calculateImpactAngle(vector, vector))).toBe(true);
    const reflected = reflectVector(vector, { x: 0, y: -1 });
    expect(Number.isFinite(reflected.x)).toBe(true);
    expect(Number.isFinite(reflected.y)).toBe(true);
  });
});
