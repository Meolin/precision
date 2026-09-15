import { describe, expect, it } from 'vitest';
import type { UnitState } from '../entities/UnitState';
import { queryEntitiesInRadius } from './queryEntitiesInRadius';

function unit(id: number, x: number, radiusMeters = 1): UnitState {
  return {
    id,
    teamId: 1,
    position: { x, y: 0 },
    hitbox: { type: 'circle', radiusMeters },
    health: { current: 100, max: 100 },
    alive: true,
  };
}

describe('hitbox-aware area query', () => {
  const center = { x: 0, y: 0 };
  it('includes inside/overlapping hitboxes and excludes outside ones, in unit order', () => {
    const units = [unit(5, 2), unit(2, 6.5), unit(3, 7.1)];
    const before = JSON.stringify(units);
    const result = queryEntitiesInRadius(center, 6, units);
    expect(result.map((entry) => entry.entityId)).toEqual([5, 2]);
    expect(result.map((entry) => entry.distanceMeters)).toEqual([1, 5.5]);
    expect(result[1]?.closestPoint).toEqual({ x: 5.5, y: 0 });
    expect(JSON.stringify(units)).toBe(before);
  });
  it('uses offsets and returns zero distance inside a hitbox', () => {
    const offset = unit(2, 10);
    offset.hitbox.offset = { x: -5, y: 0 };
    const result = queryEntitiesInRadius(center, 6, [unit(1, 0), offset]);
    expect(result[0]?.distanceMeters).toBe(0);
    expect(result[0]?.closestPoint).toEqual(center);
    expect(result[1]?.distanceMeters).toBe(4);
    expect(result[1]?.targetPosition).toEqual({ x: 5, y: 0 });
  });
  it('includes the exact outer rim as a candidate but ignores dead units', () => {
    const dead = { ...unit(3, 1), alive: false };
    const depleted = unit(4, 1);
    depleted.health.current = 0;
    expect(
      queryEntitiesInRadius(center, 6, [unit(2, 7), dead, depleted]).map((entry) => entry.entityId),
    ).toEqual([2]);
  });
  it('rejects empty or invalid query radii', () => {
    for (const radius of [0, -1, NaN, Infinity])
      expect(queryEntitiesInRadius(center, radius, [unit(1, 0)])).toEqual([]);
  });
});
