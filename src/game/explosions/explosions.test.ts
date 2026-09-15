import { describe, expect, it } from 'vitest';
import type { UnitState } from '../entities/UnitState';
import { TerrainGrid } from '../terrain/TerrainGrid';
import { TerrainMaterialId as Material } from '../terrain/TerrainMaterialId';
import { applyTerrainDamage } from '../terrain/damageTerrain';
import { cloneConfig, validateConfig } from '../config/defaultGameConfig';
import { resolveWeapon, withExplosionToggle } from '../weapons/WeaponSettings';
import { calculateExplosionDamage } from './calculateExplosionDamage';
import { createExplosionEvent } from './ExplosionEvent';
import {
  defaultExplosionDefinition as defaults,
  validateExplosionDefinition,
} from './ExplosionDefinition';
import { isBlastPathOccluded } from './isBlastPathOccluded';
import { resolveExplosion } from './resolveExplosion';

function target(id: number, x: number, y = 5): UnitState {
  return {
    id,
    teamId: 2,
    position: { x, y },
    hitbox: { type: 'circle', radiusMeters: 0.5 },
    health: { current: 100, max: 100 },
    alive: true,
  };
}
const impact = { tick: 4, projectileId: 8, position: { x: 2.25, y: 5.25 } };

describe('explosion falloff and definitions', () => {
  it('keeps full damage in the inner zone, then falls linearly toward minimum', () => {
    expect(calculateExplosionDamage(0, defaults)).toBe(60);
    expect(calculateExplosionDamage(1.5, defaults)).toBe(60);
    expect(calculateExplosionDamage(3.75, defaults)).toBe(32.5);
    expect(calculateExplosionDamage(5.99, defaults)).toBeGreaterThan(5);
    expect(calculateExplosionDamage(5.99, defaults)).toBeLessThan(6);
    expect(calculateExplosionDamage(6, defaults)).toBe(0);
    expect(calculateExplosionDamage(7, defaults)).toBe(0);
  });
  it('handles equal, excessive, zero and non-finite radii safely', () => {
    for (const innerRadiusMeters of [6, 20]) {
      const definition = { ...defaults, innerRadiusMeters };
      expect(calculateExplosionDamage(5.99, definition)).toBe(60);
      expect(calculateExplosionDamage(6, definition)).toBe(0);
    }
    for (const radiusMeters of [0, NaN, -1])
      expect(calculateExplosionDamage(0, { ...defaults, radiusMeters })).toBe(0);
    expect(calculateExplosionDamage(NaN, defaults)).toBe(0);
    expect(
      validateExplosionDefinition({ ...defaults, minDamage: 90, occludedDamageMultiplier: 8 }),
    ).toMatchObject({ minDamage: 60, occludedDamageMultiplier: 1 });
  });
  it('validates and independently clones per-weapon overrides, retaining disabled tuning', () => {
    const config = cloneConfig();
    config.weaponOverrides.mortar = {
      explosion: {
        radiusMeters: 2,
        innerRadiusMeters: 9,
        maxDamage: 10,
        minDamage: 50,
        occludedDamageMultiplier: -2,
        terrainDamageRadiusMeters: NaN,
      },
    };
    const valid = validateConfig(config);
    expect(resolveWeapon(valid, 'mortar').impact.explosion).toMatchObject({
      radiusMeters: 2,
      innerRadiusMeters: 2,
      maxDamage: 10,
      minDamage: 10,
      terrainDamageRadiusMeters: 2.8,
      occludedDamageMultiplier: 0,
    });
    const copy = cloneConfig(valid);
    expect(copy.weaponOverrides.mortar?.explosion).not.toBe(
      valid.weaponOverrides.mortar?.explosion,
    );
    const disabled = withExplosionToggle(valid, 'mortar', 'enabled', false);
    expect(resolveWeapon(disabled, 'mortar').impact.explosion).toBeUndefined();
    expect(
      resolveWeapon(withExplosionToggle(disabled, 'mortar', 'enabled', true), 'mortar').impact
        .explosion?.radiusMeters,
    ).toBe(2);
    expect(resolveWeapon(valid, 'basicCannon').impact.explosion).toBeUndefined();
    expect(resolveWeapon(valid, 'heavyPenetrator').impact.explosion).toBeUndefined();
  });
  it('captures serializable impact-time settings without aliases', () => {
    const definition = { ...defaults };
    const source = { ...impact, position: { ...impact.position } };
    const event = createExplosionEvent(source, definition, 1);
    definition.radiusMeters = 10;
    source.position.x = 50;
    expect(event.radiusMeters).toBe(6);
    expect(event.position.x).toBe(2.25);
    expect(JSON.parse(JSON.stringify(event))).toEqual(event);
  });
});

describe('blast terrain occlusion', () => {
  const from = { x: 2.25, y: 5.25 };
  const to = { x: 8.25, y: 5.25 };
  it.each([Material.Soil, Material.Rock])(
    'finds even a single blocking cell of material %s',
    (material) => {
      const terrain = new TerrainGrid(24, 24, 0.5);
      expect(isBlastPathOccluded(from, to, terrain)).toBe(false);
      terrain.setMaterial(10, 10, material);
      expect(isBlastPathOccluded(from, to, terrain)).toBe(true);
      expect(isBlastPathOccluded(to, from, terrain)).toBe(true);
    },
  );
  it('skips its own occupied cell but still detects an adjacent occupied cell', () => {
    const terrain = new TerrainGrid(24, 24, 0.5);
    terrain.setSolid(4, 10, true);
    expect(isBlastPathOccluded(from, to, terrain)).toBe(false);
    terrain.setSolid(5, 10, true);
    expect(isBlastPathOccluded(from, to, terrain)).toBe(true);
    expect(isBlastPathOccluded(from, from, terrain)).toBe(false);
  });
  it('samples short and diagonal paths, including the target endpoint', () => {
    const terrain = new TerrainGrid(24, 24, 0.5);
    terrain.setSolid(5, 10, true);
    expect(isBlastPathOccluded({ x: 2.49, y: 5.25 }, { x: 2.51, y: 5.25 }, terrain)).toBe(true);
    terrain.setSolid(10, 10, true);
    expect(isBlastPathOccluded({ x: 2.25, y: 2.25 }, { x: 8.25, y: 8.25 }, terrain)).toBe(true);
  });
});

describe('pure explosion resolution', () => {
  it('emits separate damage events, skips dead units and leaves inputs untouched', () => {
    const terrain = new TerrainGrid(24, 24, 0.5);
    const units = [target(2, 3), target(3, 6), { ...target(4, 4), alive: false }, target(5, 11)];
    const event = createExplosionEvent(impact, defaults, 1);
    const before = JSON.stringify(units);
    const cells = terrain.cells.slice();
    const first = resolveExplosion(event, units, terrain);
    expect(first.entityDamageEvents.map((damage) => damage.targetEntityId)).toEqual([2, 3]);
    expect(first.entityDamageEvents[0]?.damage).toBe(60);
    expect(first.entityDamageEvents[1]?.damage).toBeLessThan(60);
    expect(first.entityDamageEvents.every((damage) => damage.damageKind === 'explosion')).toBe(
      true,
    );
    expect(JSON.stringify(units)).toBe(before);
    expect(terrain.cells).toEqual(cells);
    expect(terrain.version).toBe(0);
    expect(resolveExplosion(event, units, terrain)).toEqual(first);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });
  it('multiplies blocked damage and can disable occlusion or fully block damage', () => {
    const terrain = new TerrainGrid(24, 24, 0.5);
    terrain.setSolid(8, 10, true);
    const unit = target(2, 5.25, 5.25);
    const event = createExplosionEvent(
      impact,
      { ...defaults, maxDamage: 40, innerRadiusMeters: 4 },
      1,
    );
    const blocked = resolveExplosion(event, [unit], terrain);
    expect(blocked.affectedEntities[0]).toMatchObject({
      rawDamage: 40,
      occluded: true,
      finalDamage: 10,
    });
    expect(blocked.entityDamageEvents[0]?.damage).toBe(10);
    expect(
      resolveExplosion({ ...event, terrainOcclusionEnabled: false }, [unit], terrain)
        .affectedEntities[0],
    ).toMatchObject({ occluded: false, finalDamage: 40 });
    expect(
      resolveExplosion({ ...event, occludedDamageMultiplier: 0 }, [unit], terrain)
        .entityDamageEvents,
    ).toEqual([]);
  });
  it('keeps entity and terrain radii independent and returns replayable circle damage', () => {
    const terrain = new TerrainGrid(24, 24, 0.5);
    terrain.setSolid(4, 10, true);
    terrain.setSolid(10, 10, true);
    const event = createExplosionEvent(impact, { ...defaults, terrainDamageRadiusMeters: 1 }, 1);
    const result = resolveExplosion(event, [target(2, 7)], terrain);
    expect(result.entityDamageEvents).toHaveLength(1);
    expect(result.terrainDamageEvent?.operation).toEqual({
      type: 'circle',
      center: impact.position,
      radiusMeters: 1,
    });
    applyTerrainDamage(terrain, result.terrainDamageEvent!);
    expect(terrain.isSolid(4, 10)).toBe(false);
    expect(terrain.isSolid(10, 10)).toBe(true);
    expect(
      resolveExplosion({ ...event, terrainDamageRadiusMeters: 0 }, [target(2, 7)], terrain)
        .terrainDamageEvent,
    ).toBeUndefined();
    const terrainOnly = resolveExplosion({ ...event, radiusMeters: 0 }, [target(2, 2)], terrain);
    expect(terrainOnly.entityDamageEvents).toEqual([]);
    expect(terrainOnly.terrainDamageEvent).toBeDefined();
  });
  it('creates no zero damage event for a target exactly on the outer hitbox boundary', () => {
    const event = createExplosionEvent(impact, defaults, 1);
    const result = resolveExplosion(
      event,
      [target(2, impact.position.x + 6.5, impact.position.y)],
      new TerrainGrid(24, 24, 0.5),
    );
    expect(result.affectedEntities).toHaveLength(1);
    expect(result.affectedEntities[0]?.finalDamage).toBe(0);
    expect(result.entityDamageEvents).toEqual([]);
  });
});
