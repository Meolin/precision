import { describe, expect, it } from 'vitest';
import { raycastTerrain, sweepTerrain } from './terrainCollision';
import { TerrainGrid } from './TerrainGrid';
import { TerrainMaterialId as Material } from './TerrainMaterialId';

describe('chunked packed terrain collision', () => {
  it('reads and writes across Uint32 and chunk boundaries', () => {
    const terrain = new TerrainGrid(130, 3, 1, undefined, 64);
    for (const x of [0, 31, 32, 63, 64, 95, 96, 127, 128, 129])
      terrain.setMaterial(x, 1, Material.Rock);

    for (let x = 0; x < terrain.columns; x++)
      expect(terrain.isSolid(x, 1), `x=${x}`).toBe(
        [0, 31, 32, 63, 64, 95, 96, 127, 128, 129].includes(x),
      );
    expect(terrain.chunks).toHaveLength(3);
    expect(terrain.chunks.map((chunk) => chunk.collision.constructor)).toEqual([
      Uint32Array,
      Uint32Array,
      Uint32Array,
    ]);

    for (const x of [31, 32, 63, 64]) terrain.setSolid(x, 1, false);
    for (const x of [31, 32, 63, 64]) expect(terrain.isSolid(x, 1)).toBe(false);
    expect(terrain.isSolid(-1, 1)).toBe(false);
    expect(terrain.isSolid(130, 1)).toBe(false);
  });

  it('reports one, two and four affected chunks without touching distant chunks', () => {
    const filled = new Uint8Array(16 * 16).fill(Material.Soil);

    const inside = new TerrainGrid(16, 16, 1, filled, 8);
    expect(inside.destroyCircle({ x: 3.5, y: 3.5 }, 2).affectedChunks).toHaveLength(1);

    const acrossTwo = new TerrainGrid(16, 16, 1, filled, 8);
    const two = acrossTwo.destroyCircle({ x: 8, y: 3.5 }, 2);
    expect(two.affectedChunks.map(({ id }) => `${id.column}:${id.row}`)).toEqual(['0:0', '1:0']);

    const acrossFour = new TerrainGrid(16, 16, 1, filled, 8);
    const four = acrossFour.destroyCircle({ x: 8, y: 8 }, 2);
    expect(four.affectedChunks.map(({ id }) => `${id.column}:${id.row}`)).toEqual([
      '0:0',
      '1:0',
      '0:1',
      '1:1',
    ]);
    expect(acrossFour.getChunk({ column: 0, row: 0 })?.dirtyRect).toBeDefined();
  });

  it('handles world edges, overlaps, tiny and large circles deterministically', () => {
    const terrain = new TerrainGrid(20, 20, 1, new Uint8Array(400).fill(Material.Soil), 8);
    const edge = terrain.destroyCircle({ x: 0, y: 0 }, 2);
    expect(edge.modifiedPixels).toBeGreaterThan(0);
    expect(edge.dirtyRect?.minX).toBe(0);
    expect(edge.dirtyRect?.minY).toBe(0);

    const tiny = terrain.destroyCircle({ x: 10.5, y: 10.5 }, 0.01);
    expect(tiny.modifiedPixels).toBe(1);
    expect(terrain.destroyCircle({ x: 10.5, y: 10.5 }, 0.01).changed).toBe(false);

    const large = terrain.destroyCircle({ x: 10, y: 10 }, 100);
    expect(large.affectedChunks).toHaveLength(9);
    expect(terrain.cells.every((material) => material === Material.Air)).toBe(true);
  });

  it('raycasts fast, grazing and exact chunk-boundary contacts against the mask', () => {
    const terrain = new TerrainGrid(128, 20, 1, undefined, 64);
    terrain.setSolid(64, 10, true);
    expect(raycastTerrain(terrain, { x: 0, y: 10.5 }, { x: 127, y: 10.5 })).not.toBeNull();
    expect(sweepTerrain(terrain, { x: 0, y: 9.8 }, { x: 127, y: 9.8 }, 0.21)).not.toBeNull();
    const boundary = raycastTerrain(terrain, { x: 63.5, y: 10.5 }, { x: 64.5, y: 10.5 });
    expect(boundary?.contactPoint.x).toBeCloseTo(64, 2);
  });
});
