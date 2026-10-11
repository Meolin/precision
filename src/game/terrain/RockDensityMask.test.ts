import { describe, expect, it } from 'vitest';
import { cloneConfig, validateConfig } from '../config/defaultGameConfig';
import { GameRuntime } from '../core/GameRuntime';
import { createGameSnapshot } from '../core/GameSnapshot';
import {
  createActivePenetration,
  advanceActivePenetration,
  resolvePenetration,
} from '../impacts/resolvePenetration';
import type { PenetrationInput } from '../impacts/resolvePenetration';
import { applyTerrainDamage } from './damageTerrain';
import { sampleRockDensity, rockDensityResistance, type RockDensityMask } from './RockDensityMask';
import { TerrainGrid } from './TerrainGrid';
import { TerrainMaterialId as Material } from './TerrainMaterialId';
import type { TerrainDamageOperation } from './TerrainDamageOperation';

function mask(value = 255): RockDensityMask {
  return {
    sourceId: 'test',
    width: 1,
    height: 1,
    tileWidthMeters: 4,
    tileHeightMeters: 4,
    orientation: 'sequential',
    values: [value],
  };
}

function terrain(density: RockDensityMask | null, material: Material = Material.Rock) {
  return new TerrainGrid(
    100,
    100,
    0.1,
    new Uint8Array(10000).fill(material),
    16,
    undefined,
    density,
  );
}

describe('Rock texture density', () => {
  it('maps black and white monotonically to resistance', () => {
    const values = [0, 64, 128, 192, 255].map((value) =>
      rockDensityResistance(mask(value), { x: 1, y: 1 }),
    );
    expect(values[0]).toBe(0.5);
    expect(values.at(-1)).toBe(2);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  it('repeats and mirrors both texture axes at the same world coordinates', () => {
    const field: RockDensityMask = { ...mask(), width: 2, height: 2, values: [0, 64, 128, 255] };
    expect(sampleRockDensity(field, { x: 1, y: 1 })).toBe(0);
    expect(sampleRockDensity(field, { x: 5, y: 1 })).toBe(0);
    expect(sampleRockDensity(field, { x: -3, y: 1 })).toBe(0);
    const mirrored = { ...field, orientation: 'mirrored' as const };
    expect(sampleRockDensity(mirrored, { x: 5, y: 1 })).toBeCloseTo(64 / 255);
    expect(sampleRockDensity(mirrored, { x: 1, y: 5 })).toBeCloseTo(128 / 255);
    const mirrorX = { ...field, orientation: 'mirror-x' as const };
    expect(sampleRockDensity(mirrorX, { x: 1, y: 5 })).toBe(0);
  });

  it('interpolates at texel boundaries and reproduces random tiling', () => {
    const field = { ...mask(), width: 2, values: [0, 255] };
    expect(sampleRockDensity(field, { x: 2, y: 1 })).toBe(0.5);
    const random = { ...field, orientation: 'random' as const };
    const copy = JSON.parse(JSON.stringify(random)) as RockDensityMask;
    for (const point of [
      { x: -8.3, y: 2.7 },
      { x: 15.3, y: 21.9 },
    ])
      expect(sampleRockDensity(random, point)).toBe(sampleRockDensity(copy, point));
  });

  it.each<TerrainDamageOperation>([
    { type: 'circle', center: { x: 5, y: 5 }, radiusMeters: 2 },
    { type: 'capsule', from: { x: 3, y: 5 }, to: { x: 7, y: 5 }, radiusMeters: 1 },
  ])('destroys weak Rock more readily for $type damage, preserving Soil', (operation) => {
    const weak = terrain(mask(0));
    const legacy = terrain(null);
    const strong = terrain(mask(255));
    const removedWeak = applyTerrainDamage(weak, operation);
    const removedLegacy = applyTerrainDamage(legacy, operation);
    const removedStrong = applyTerrainDamage(strong, operation);
    expect(removedWeak).toBeGreaterThan(removedLegacy);
    expect(removedStrong).toBeLessThan(removedLegacy);
    expect(strong.version).toBe(1);
    expect(strong.getChangesSince(0).length).toBeGreaterThan(0);
    expect(applyTerrainDamage(strong, operation)).toBe(0);
    const soil = terrain(mask(255), Material.Soil);
    const oldSoil = terrain(null, Material.Soil);
    expect(applyTerrainDamage(soil, operation)).toBe(applyTerrainDamage(oldSoil, operation));
    expect(soil.cells).toEqual(oldSoil.cells);
    for (const chunk of strong.chunks)
      for (let y = 0; y < chunk.height; y++)
        for (let x = 0; x < chunk.width; x++)
          expect(strong.isSolid(chunk.originX + x, chunk.originY + y)).toBe(
            strong.getMaterialAtCell(chunk.originX + x, chunk.originY + y) !== Material.Air,
          );
  });

  it('makes a nonuniform mask shape the crater and leaves invalid damage untouched', () => {
    const field = {
      ...mask(),
      width: 2,
      tileWidthMeters: 10,
      tileHeightMeters: 10,
      values: [0, 255],
    };
    const grid = terrain(field);
    applyTerrainDamage(grid, { type: 'circle', center: { x: 5, y: 5 }, radiusMeters: 2 });
    expect(grid.isSolid(29, 49)).toBe(false);
    expect(grid.isSolid(70, 49)).toBe(true);
    const before = grid.cells.slice();
    expect(
      applyTerrainDamage(grid, { type: 'circle', center: { x: NaN, y: 5 }, radiusMeters: 2 }),
    ).toBe(0);
    expect(grid.cells).toEqual(before);
  });

  it('preserves swept projectile clearance through the densest Rock', () => {
    const grid = terrain(mask(255));
    applyTerrainDamage(grid, {
      type: 'capsule',
      from: { x: 2, y: 5.05 },
      to: { x: 8, y: 5.05 },
      radiusMeters: 0.4,
      minimumRadiusMeters: 0.35,
    });
    // 0.3 m lies outside the density-scaled 0.283 m radius, inside body clearance.
    expect(grid.getMaterialAtCell(50, 53)).toBe(Material.Air);
    expect(grid.getMaterialAtCell(50, 54)).toBe(Material.Rock);
  });

  it('charges both penetration paths for density even after channel cells are erased', () => {
    const request = (grid: TerrainGrid): PenetrationInput => ({
      terrain: grid,
      entryPosition: { x: 2, y: 5 },
      velocity: { x: 100, y: 0 },
      initialEnergyJ: 20000,
      massKg: 4,
      radiusMeters: 0,
      definition: {
        enabled: true,
        penetrationPower: 1,
        penetrationRadiusMeters: 0.2,
        maxPenetrationDistanceMeters: 5,
        minimumExitEnergyJ: 10,
      },
    });
    const weak = request(terrain(mask(0)));
    const strong = request(terrain(mask(255)));
    expect(resolvePenetration(weak).penetrationDistanceMeters).toBeGreaterThan(
      resolvePenetration(strong).penetrationDistanceMeters,
    );
    const active = createActivePenetration(strong)!;
    applyTerrainDamage(strong.terrain, {
      type: 'capsule',
      from: { x: 2, y: 5 },
      to: { x: 4, y: 5 },
      radiusMeters: 0.3,
    });
    const result = advanceActivePenetration(
      active,
      strong.massKg,
      0,
      strong.definition,
      strong.terrain,
      0.001,
    );
    expect(result.energyLostJ / result.distanceMeters).toBeCloseTo(24000);
  });

  it('copies mask input into config, terrain and snapshot; texture changes reset the world', () => {
    const config = cloneConfig();
    config.terrain.rockDensityMask = mask(0);
    const runtime = new GameRuntime(config);
    const original = runtime.getState().terrain;
    const snapshot = createGameSnapshot(runtime.getState());
    const values = snapshot.terrain.rockDensityMask!.values as number[];
    values[0] = 255;
    expect(original.rockDensityMask!.values[0]).toBe(0);
    const next = cloneConfig(runtime.getConfig());
    next.terrain.rockDensityMask = mask(255);
    runtime.updateConfig(next);
    expect(runtime.getState().terrain).not.toBe(original);
    expect(runtime.getState().terrain.rockDensityMask!.values[0]).toBe(255);
    const invalid = cloneConfig(config);
    invalid.terrain.rockDensityMask = { ...mask(), values: [256] };
    expect(validateConfig(invalid).terrain.rockDensityMask).toBeNull();
  });
});
