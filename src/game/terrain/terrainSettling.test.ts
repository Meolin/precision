import { describe, expect, it } from 'vitest';
import { cloneConfig } from '../config/defaultGameConfig';
import { createGameState } from '../core/GameState';
import { stepSimulation } from '../core/stepSimulation';
import { TerrainGrid } from './TerrainGrid';
import { TerrainMaterialId as Material } from './TerrainMaterialId';
import { advanceTerrainFall, queueTerrainSettling, startTerrainFall } from './terrainSettling';

function scrapedTerrain(): TerrainGrid {
  const width = 21;
  const height = 16;
  const cells = new Uint8Array(width * height);
  for (let y = 12; y < height; y++)
    for (let x = 0; x < width; x++) cells[y * width + x] = Material.Rock;
  // The narrow trace is still attached to a broad wall at its left end.
  for (let y = 3; y < 12; y++) cells[y * width + 6] = Material.Soil;
  for (let x = 7; x <= 13; x++) cells[4 * width + x] = Material.Soil;
  return new TerrainGrid(width, height, 1, cells);
}

function countMaterial(terrain: TerrainGrid): number {
  return terrain.cells.reduce((count, material) => count + (material !== Material.Air ? 1 : 0), 0);
}

describe('delayed terrain settling', () => {
  it('drops a thin attached trace into a material-conserving mound', () => {
    const terrain = scrapedTerrain();
    const before = countMaterial(terrain);
    const falling = startTerrainFall(terrain, { minX: 7, minY: 4, maxX: 13, maxY: 4 });
    expect(falling.flatMap((cluster) => cluster.cells)).toHaveLength(7);
    expect(countMaterial(terrain)).toBe(before - 7);
    for (let x = 7; x <= 13; x++) expect(terrain.getMaterialAtCell(x, 4)).toBe(Material.Air);
    expect(terrain.getMaterialAtCell(6, 4)).toBe(Material.Soil);
    advanceTerrainFall(terrain, falling, 0.13);
    expect(falling).toHaveLength(1);
    expect(countMaterial(terrain)).toBe(before - 7);
    advanceTerrainFall(terrain, falling, 0.13);
    expect(falling).toHaveLength(0);
    expect(countMaterial(terrain)).toBe(before);
    expect(
      terrain.cells
        .slice(9 * terrain.columns, 12 * terrain.columns)
        .filter((cell) => cell === Material.Soil).length,
    ).toBe(7);
    expect(terrain.getChangesSince(0)).toHaveLength(2);
  });

  it('waits 50 ms of simulation time and leaves broad terrain alone', () => {
    const config = cloneConfig();
    config.world.widthMeters = 21;
    config.world.heightMeters = 16;
    config.terrain.cellSizeMeters = 1;
    const state = createGameState(config, 123);
    state.terrain = scrapedTerrain();
    state.units = [];
    const before = countMaterial(state.terrain);
    queueTerrainSettling(state.pendingTerrainSettling, { minX: 7, minY: 4, maxX: 13, maxY: 4 }, 0);
    for (let tick = 0; tick < 2; tick++) stepSimulation(state, config, 0.02);
    expect(state.terrain.getMaterialAtCell(10, 4)).toBe(Material.Soil);
    stepSimulation(state, config, 0.02);
    expect(state.terrain.getMaterialAtCell(10, 4)).toBe(Material.Air);
    expect(state.pendingTerrainSettling).toHaveLength(0);
    expect(state.fallingTerrain).toHaveLength(1);
    stepSimulation(state, config, 0.25);
    expect(state.fallingTerrain).toHaveLength(0);
    expect(countMaterial(state.terrain)).toBe(before);
    expect(state.terrain.getMaterialAtCell(10, 12)).toBe(Material.Rock);
  });
});
