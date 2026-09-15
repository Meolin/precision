import { describe, expect, it } from 'vitest';
import { createProjectile } from '../ballistics/Projectile';
import { advanceProjectile } from '../ballistics/projectilePhysics';
import { cloneConfig } from '../config/defaultGameConfig';
import { createGameState } from '../core/GameState';
import { cloneUnit } from '../entities/UnitState';
import { TerrainGrid } from '../terrain/TerrainGrid';
import { queryProjectileCollision } from './queryProjectileCollision';
import { segmentCircleIntersection } from './segmentCircleIntersection';

describe('segment-circle sweep', () => {
  const center = { x: 5, y: 5 };
  it('misses outside the circle and behind the direction of travel', () => {
    expect(segmentCircleIntersection({ x: 0, y: 3 }, { x: 10, y: 3 }, center, 1)).toBeNull();
    expect(segmentCircleIntersection({ x: 7, y: 5 }, { x: 10, y: 5 }, center, 1)).toBeNull();
  });
  it('returns the first entry through the center', () => {
    expect(segmentCircleIntersection({ x: 0, y: 5 }, { x: 10, y: 5 }, center, 1)).toEqual({
      fraction: 0.4,
      position: { x: 4, y: 5 },
      normal: { x: -1, y: 0 },
    });
  });
  it('includes a tangent and endpoint contact', () => {
    expect(segmentCircleIntersection({ x: 0, y: 4 }, { x: 10, y: 4 }, center, 1)?.fraction).toBe(
      0.5,
    );
    expect(segmentCircleIntersection({ x: 0, y: 5 }, { x: 4, y: 5 }, center, 1)?.fraction).toBe(1);
  });
  it('handles starts near/inside the circle and zero-length segments with safe normals', () => {
    expect(
      segmentCircleIntersection({ x: 3.999999, y: 5 }, { x: 6, y: 5 }, center, 1)?.fraction,
    ).toBeGreaterThan(0);
    for (const from of [center, { x: 4.5, y: 5 }]) {
      const hit = segmentCircleIntersection(from, from, center, 1)!;
      expect(hit.fraction).toBe(0);
      expect(Math.hypot(hit.normal.x, hit.normal.y)).toBeCloseTo(1);
    }
    expect(segmentCircleIntersection({ x: 0, y: 0 }, { x: 0, y: 0 }, center, 1)).toBeNull();
    expect(segmentCircleIntersection(center, center, center, NaN)).toBeNull();
  });
});

function scene() {
  const config = cloneConfig();
  config.physics.gravity = 0;
  const state = createGameState(config, 12345);
  const terrain = new TerrainGrid(120, 64, 1);
  const unit = cloneUnit(state.units[1]!);
  unit.position = { x: 5, y: 5 };
  unit.hitbox.radiusMeters = 1;
  const shell = createProjectile(state.cannon, config, 3, 0);
  shell.previousPosition = { x: 0, y: 5 };
  shell.position = { x: 10, y: 5 };
  shell.radius = 0.1;
  return { config, state, terrain, unit, shell };
}

describe('nearest terrain/entity collision', () => {
  it('selects the unit before terrain on the same full segment', () => {
    const { terrain, shell, unit } = scene();
    terrain.setSolid(8, 5, true);
    const hit = queryProjectileCollision(shell, terrain, [unit]);
    expect(hit?.type).toBe('entity');
    expect(hit?.fraction).toBeCloseTo(0.39);
  });
  it('selects terrain before a unit on the same full segment', () => {
    const { terrain, shell, unit } = scene();
    terrain.setSolid(2, 5, true);
    expect(queryProjectileCollision(shell, terrain, [unit])?.type).toBe('terrain');
  });
  it('uses geometry then IDs rather than collection order, and skips wrecks', () => {
    const { terrain, shell, unit } = scene();
    const far = cloneUnit(unit);
    far.id = 4;
    far.position.x = 8;
    expect(queryProjectileCollision(shell, terrain, [far, unit])).toMatchObject({
      type: 'entity',
      entityId: unit.id,
    });
    unit.alive = false;
    expect(queryProjectileCollision(shell, terrain, [unit, far])).toMatchObject({
      type: 'entity',
      entityId: far.id,
    });
    unit.alive = true;
    far.position.x = 5;
    expect(queryProjectileCollision(shell, terrain, [far, unit])).toMatchObject({
      entityId: unit.id,
    });
  });
  it('includes projectile radius and hitbox offset', () => {
    const { terrain, shell, unit } = scene();
    shell.previousPosition.y = 3.5;
    shell.position.y = 3.5;
    expect(queryProjectileCollision(shell, terrain, [unit])).toBeNull();
    shell.radius = 0.5;
    expect(queryProjectileCollision(shell, terrain, [unit])?.fraction).toBeCloseTo(0.5);
    unit.position.y = 10;
    unit.hitbox.offset = { x: 0, y: -5 };
    expect(queryProjectileCollision(shell, terrain, [unit])?.fraction).toBeCloseTo(0.5);
  });
  it('catches a high-speed crossing even when the endpoint leaves the map', () => {
    const { config, terrain, shell, unit } = scene();
    shell.position = { x: 0, y: 5 };
    shell.velocity = { x: 10000, y: 0 };
    expect(advanceProjectile(shell, terrain, config, 1 / 60, undefined, [unit])).toMatchObject({
      type: 'entity',
      entityId: unit.id,
    });
    expect(shell.position.x).toBeCloseTo(3.9);
  });
  it('ignores owner until fully outside, then allows a returning hit', () => {
    const { config, terrain, shell, unit } = scene();
    shell.ownerEntityId = unit.id;
    shell.hasExitedOwnerHitbox = false;
    shell.position = { ...unit.position };
    shell.velocity = { x: 10, y: 0 };
    expect(advanceProjectile(shell, terrain, config, 0.05, undefined, [unit])).toBeNull();
    expect(shell.hasExitedOwnerHitbox).toBe(false);
    expect(advanceProjectile(shell, terrain, config, 0.2, undefined, [unit])).toBeNull();
    expect(shell.hasExitedOwnerHitbox).toBe(true);
    shell.velocity.x = -10;
    expect(advanceProjectile(shell, terrain, config, 0.3, undefined, [unit])).toMatchObject({
      type: 'entity',
      entityId: unit.id,
    });
  });
  it('ends owner immunity at an outside start before considering a returning segment', () => {
    const { config, terrain, shell, unit } = scene();
    shell.ownerEntityId = unit.id;
    shell.hasExitedOwnerHitbox = false;
    shell.position = { x: 8, y: 5 };
    shell.velocity = { x: -10, y: 0 };
    expect(advanceProjectile(shell, terrain, config, 0.5, undefined, [unit])).toMatchObject({
      entityId: unit.id,
    });
  });
});
