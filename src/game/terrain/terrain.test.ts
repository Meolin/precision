import { describe, expect, it } from 'vitest';
import { cloneConfig } from '../config/defaultGameConfig';
import { applyTerrainDamage } from './damageTerrain';
import { craterRadius } from '../impacts/resolveImpact';
import { impactDefinitions } from '../impacts/impactDefinitions';
import { generateTerrain } from './generateTerrain';
import { circleTouchesTerrain, sweepTerrain } from './terrainCollision';
import { TerrainGrid } from './TerrainGrid';

describe('terrain occupancy and damage', () => {
  it('removes a circle while preserving distant cells', () => {
    const grid = new TerrainGrid(20, 20, 1, new Uint8Array(400).fill(1));
    const removed = applyTerrainDamage(grid, {
      type: 'circle',
      center: { x: 10, y: 10 },
      radius: 3,
    });
    expect(removed).toBeGreaterThan(0);
    for (let y = 0; y < 20; y++)
      for (let x = 0; x < 20; x++) {
        expect(grid.isSolid(x, y)).toBe((x + 0.5 - 10) ** 2 + (y + 0.5 - 10) ** 2 > 9);
      }
    expect(grid.isSolid(0, 0)).toBe(true);
    expect(grid.version).toBe(1);
  });

  it('only increments version when occupancy changes', () => {
    const grid = new TerrainGrid(5, 5, 1);
    grid.setSolid(2, 2, true);
    grid.setSolid(2, 2, true);
    expect(grid.version).toBe(1);
    grid.removeCircle({ x: 2.5, y: 2.5 }, 1);
    expect(grid.version).toBe(2);
    grid.removeCircle({ x: 2.5, y: 2.5 }, 1);
    expect(grid.version).toBe(2);
  });

  it('handles craters on the edge and outside the map', () => {
    const grid = new TerrainGrid(5, 5, 1, new Uint8Array(25).fill(1));
    expect(grid.removeCircle({ x: -100, y: -100 }, 1)).toBe(0);
    expect(grid.removeCircle({ x: 0, y: 0 }, 2)).toBeGreaterThan(0);
    expect(grid.isSolid(4, 4)).toBe(true);
  });

  it('finds the top surface from occupancy and converts world coordinates', () => {
    const grid = new TerrainGrid(10, 10, 0.2);
    grid.setSolid(3, 6, true);
    expect(grid.findSurfaceY(0.7)).toBeCloseTo(1.2);
    expect(grid.findSurfaceY(0.1)).toBeNull();
    expect(grid.worldToCell({ x: 0.7, y: 1.3 })).toEqual({ x: 3, y: 6 });
    expect(grid.isSolid(-1, 6)).toBe(false);
  });

  it('increases crater size with energy and respects the cap', () => {
    const terrain = impactDefinitions.basicImpact.terrainDamage;
    expect(craterRadius(0, terrain)).toBe(0.8);
    expect(craterRadius(4000, terrain)).toBeGreaterThan(craterRadius(1000, terrain));
    expect(craterRadius(1e12, terrain)).toBe(3);
  });
});

describe('swept collisions', () => {
  it('detects a fast segment crossing just one solid cell', () => {
    const grid = new TerrainGrid(100, 20, 0.2);
    grid.setSolid(50, 10, true);
    const hit = sweepTerrain(grid, { x: 0, y: 2.1 }, { x: 19, y: 2.1 }, 0.03);
    expect(hit).not.toBeNull();
    expect(hit?.position.x).toBeCloseTo(9.97, 2);
    expect(hit?.fraction).toBeGreaterThan(0);
    expect(hit?.fraction).toBeLessThan(1);
  });

  it('accounts for radius when the center misses the solid cell', () => {
    const grid = new TerrainGrid(10, 10, 1);
    grid.setSolid(5, 5, true);
    expect(circleTouchesTerrain(grid, { x: 5.5, y: 4.8 }, 0.3)).toBe(true);
    expect(sweepTerrain(grid, { x: 0, y: 4.8 }, { x: 9, y: 4.8 }, 0.3)).not.toBeNull();
  });

  it('does not collide in empty space', () => {
    expect(
      sweepTerrain(new TerrainGrid(20, 20, 1), { x: 0, y: 0 }, { x: 19, y: 19 }, 0.12),
    ).toBeNull();
  });

  it('detects an initial overlap on a stationary segment', () => {
    const grid = new TerrainGrid(10, 10, 1);
    grid.setSolid(2, 2, true);
    expect(sweepTerrain(grid, { x: 2.5, y: 2.5 }, { x: 2.5, y: 2.5 }, 0.1)?.fraction).toBe(0);
  });
});

describe('seeded generation', () => {
  it('creates identical terrain for seed 12345', () => {
    const config = cloneConfig();
    expect(generateTerrain(config, 12345).cells).toEqual(generateTerrain(config, 12345).cells);
  });

  it('creates different terrain for another seed', () => {
    const config = cloneConfig();
    expect(generateTerrain(config, 12345).cells).not.toEqual(generateTerrain(config, 12346).cells);
  });
});
