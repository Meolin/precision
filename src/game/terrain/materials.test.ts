import { describe, expect, it } from 'vitest';
import { TerrainGrid } from './TerrainGrid';
import { TerrainMaterialId as Material } from './TerrainMaterialId';
import { cloneConfig } from '../config/defaultGameConfig';
import { generateTerrain } from './generateTerrain';
import { terrainMaterialDefinitions } from './TerrainMaterialDefinition';
import { sweepTerrain } from './terrainCollision';

describe('material storage', () => {
  it('stores Soil and Rock bytes, treats Air and out of bounds as non-solid', () => {
    const terrain = new TerrainGrid(5, 5, 0.2);
    expect(terrain.cells).toBeInstanceOf(Uint8Array);
    terrain.setMaterial(2, 3, Material.Soil);
    expect(terrain.getMaterialAtCell(2, 3)).toBe(Material.Soil);
    terrain.setMaterial(2, 3, Material.Rock);
    expect(terrain.getMaterialAtWorldPosition({ x: 0.5, y: 0.7 })).toBe(Material.Rock);
    expect(terrain.isSolid(2, 3)).toBe(true);
    expect(terrain.findSurfaceY(0.5)).toBeCloseTo(0.6);
    expect(terrain.version).toBe(2);
    terrain.setMaterial(2, 3, Material.Rock);
    expect(terrain.version).toBe(2);
    for (const [x, y] of [
      [0, 0],
      [-1, 0],
      [5, 0],
      [NaN, 0],
      [1.5, 3],
    ] as const) {
      expect(terrain.getMaterialAtCell(x, y)).toBe(Material.Air);
      expect(terrain.isSolid(x, y)).toBe(false);
    }
    expect(terrain.removeCircle({ x: 0.5, y: 0.7 }, 0.12)).toBe(1);
    expect(terrain.getMaterialAtCell(2, 3)).toBe(Material.Air);
    expect(terrain.version).toBe(3);
  });

  it('keeps material properties outside the grid, with stronger Rock resistance', () => {
    expect(terrainMaterialDefinitions[Material.Air].penetrationResistance).toBe(0);
    expect(terrainMaterialDefinitions[Material.Rock].penetrationResistance).toBeGreaterThan(
      terrainMaterialDefinitions[Material.Soil].penetrationResistance,
    );
    expect(Object.isFrozen(terrainMaterialDefinitions[Material.Rock])).toBe(true);
    expect(new TerrainGrid(1, 1, 1)).not.toHaveProperty('penetrationResistance');
  });

  it('generates deterministic materials and preserves the legacy surface exactly', () => {
    const config = cloneConfig();
    const layered = generateTerrain(config, 12345);
    expect(layered.cells).toEqual(generateTerrain(config, 12345).cells);
    expect(layered.cells).not.toEqual(generateTerrain(config, 12346).cells);
    expect(layered.cells.includes(Material.Rock)).toBe(true);
    config.terrain.rockDepthMeters = null;
    const soil = generateTerrain(config, 12345);
    expect(soil.cells.includes(Material.Rock)).toBe(false);
    expect(layered.cells.map((id) => (id === Material.Air ? 0 : 1))).toEqual(soil.cells);
    for (let col = 0; col < layered.columns; col++) {
      const x = (col + 0.5) * layered.cellSizeMeters;
      expect(layered.findSurfaceY(x)).toBe(soil.findSurfaceY(x));
      const surface = layered.findSurfaceY(x)!;
      expect(layered.getMaterialAtWorldPosition({ x, y: surface + 0.1 })).toBe(Material.Soil);
    }
  });

  it('collides with either solid material and copies material bytes for snapshots', () => {
    const rock = new TerrainGrid(10, 5, 1);
    rock.setMaterial(5, 2, Material.Rock);
    const soil = new TerrainGrid(10, 5, 1);
    soil.setMaterial(5, 2, Material.Soil);
    expect(sweepTerrain(rock, { x: 0, y: 2.5 }, { x: 9, y: 2.5 }, 0.2)).toEqual(
      sweepTerrain(soil, { x: 0, y: 2.5 }, { x: 9, y: 2.5 }, 0.2),
    );
    const copy = new TerrainGrid(10, 5, 1, rock.cells);
    rock.setMaterial(5, 2, Material.Air);
    expect(copy.getMaterialAtCell(5, 2)).toBe(Material.Rock);
  });
});
