import { describe, expect, it } from 'vitest';
import { TerrainGrid } from '../terrain/TerrainGrid';
import { TerrainMaterialId as Material } from '../terrain/TerrainMaterialId';
import {
  buildTerrainMaterialPixels,
  terrainColorAtWorldPosition,
  terrainMaterialVisuals,
} from './terrainMaterialVisuals';

describe('terrain material visuals', () => {
  it('defines every solid material in the renderer-only registry', () => {
    expect(Object.keys(terrainMaterialVisuals).map(Number).sort()).toEqual([
      Material.Soil,
      Material.Rock,
    ]);
    expect(terrainMaterialVisuals[Material.Rock].texture).toMatchObject({
      assetUrl: '/Textures/Environment/Stone_example.png',
      tileWidthMeters: 19.2,
      mipmaps: true,
    });
  });

  it('ignores Air weight and supplies edge pixels for the alpha mask', () => {
    const terrain = new TerrainGrid(2, 1, 1);
    terrain.setMaterial(0, 0, Material.Soil);
    expect(terrainColorAtWorldPosition(terrain, { x: 1, y: 0.5 })).toEqual(
      terrainMaterialVisuals[Material.Soil].surface,
    );
    expect(terrainColorAtWorldPosition(terrain, { x: 1.75, y: 0.5 })).toEqual(
      terrainMaterialVisuals[Material.Soil].surface,
    );
    expect(terrainColorAtWorldPosition(terrain, { x: 4, y: 0.5 })).toBeNull();
  });

  it('prepares one source pixel per cell without leaving black beside solid terrain', () => {
    const terrain = new TerrainGrid(4, 1, 1);
    terrain.setMaterial(0, 0, Material.Soil);
    const pixels = buildTerrainMaterialPixels(terrain);
    const pixel = (column: number): number[] =>
      Array.from(pixels.slice(column * 4, column * 4 + 4));

    expect(pixel(0)).toEqual([...terrainMaterialVisuals[Material.Soil].surface, 255]);
    expect(pixel(1)).toEqual([...terrainMaterialVisuals[Material.Soil].surface, 255]);
    expect(pixel(3)).toEqual([0, 0, 0, 255]);
  });

  it('keeps air transparent for the discrete rendering mode', () => {
    const terrain = new TerrainGrid(2, 1, 1);
    terrain.setMaterial(0, 0, Material.Soil);
    const pixels = buildTerrainMaterialPixels(terrain, true);
    expect(Array.from(pixels.slice(0, 4))).toEqual([
      ...terrainMaterialVisuals[Material.Soil].surface,
      255,
    ]);
    expect(Array.from(pixels.slice(4, 8))).toEqual([0, 0, 0, 0]);
  });

  it('blends Soil and Rock without a transparent seam and stays deterministic', () => {
    const cells = new Uint8Array(4 * 6);
    for (let row = 0; row < 6; row++)
      for (let column = 0; column < 4; column++)
        cells[row * 4 + column] = column < 2 ? Material.Soil : Material.Rock;
    const terrain = new TerrainGrid(4, 6, 1, cells);
    const before = terrain.cells.slice();
    const color = terrainColorAtWorldPosition(terrain, { x: 2, y: 4.5 });
    expect(color).toEqual([57, 57, 55]);
    expect(terrainColorAtWorldPosition(terrain, { x: 2, y: 4.5 })).toEqual(color);
    expect(terrain.cells).toEqual(before);
    expect(terrain.version).toBe(0);
  });
});
