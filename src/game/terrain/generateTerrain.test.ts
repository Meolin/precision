import { describe, expect, it } from 'vitest';
import { cloneConfig } from '../config/defaultGameConfig';
import { createTerrainSurface, generateTerrain } from './generateTerrain';

describe('continuous terrain generation', () => {
  it('uses the same seeded surface at every collision resolution', () => {
    const config = cloneConfig();
    const fine = createTerrainSurface(config, 12345);
    config.terrain.cellSizeMeters = 0.4;
    const coarse = createTerrainSurface(config, 12345);
    for (const x of [0, 0.05, 12, 12.1, 61.2, config.world.widthMeters])
      expect(coarse(x)).toBe(fine(x));
  });

  it('rasterizes the surface by cell centres within half a cell vertically', () => {
    const config = cloneConfig();
    config.world.widthMeters = 24;
    config.world.heightMeters = 16;
    const surface = createTerrainSurface(config, 12345);
    for (const cell of [0.1, 0.2, 0.4]) {
      config.terrain.cellSizeMeters = cell;
      const terrain = generateTerrain(config, 12345);
      for (let column = 0; column < terrain.columns; column++) {
        const x = (column + 0.5) * cell;
        const y = surface(x);
        if (y < cell || y > config.world.heightMeters - cell) continue;
        expect(Math.abs(terrain.findSurfaceY(x)! - y)).toBeLessThanOrEqual(cell / 2 + 1e-10);
      }
    }
  });

  it('has no derivative discontinuity at a noise interval boundary', () => {
    const config = cloneConfig();
    config.terrain.waveAmplitudeMeters = 0;
    const surface = createTerrainSurface(config, 12345);
    const epsilon = 0.001;
    for (const x of [12, 24, 36]) {
      const leftSlope = (surface(x) - surface(x - epsilon)) / epsilon;
      const rightSlope = (surface(x + epsilon) - surface(x)) / epsilon;
      expect(Math.abs(leftSlope - rightSlope)).toBeLessThan(1e-5);
    }
  });
});
