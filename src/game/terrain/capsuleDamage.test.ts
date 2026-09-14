import { describe, expect, it } from 'vitest';
import { TerrainGrid } from './TerrainGrid';
import { TerrainMaterialId as Material } from './TerrainMaterialId';
import { applyTerrainDamage } from './damageTerrain';
import { circleTouchesTerrain } from './terrainCollision';
import type { TerrainDamageOperation } from './TerrainDamageOperation';

describe('semantic capsule destruction', () => {
  it.each([
    { from: { x: 2, y: 2 }, to: { x: 8, y: 8 } },
    { from: { x: 8, y: 2 }, to: { x: 2, y: 8 } },
    { from: { x: 5, y: -2 }, to: { x: 5, y: 8 } },
    { from: { x: 2, y: 5 }, to: { x: 12, y: 5 } },
  ])('clears a continuous channel in either material from $from to $to', ({ from, to }) => {
    const cells = Uint8Array.from({ length: 2500 }, (_, index) =>
      index % 2 ? Material.Rock : Material.Soil,
    );
    const grid = new TerrainGrid(50, 50, 0.2, cells);
    const damage: TerrainDamageOperation = { type: 'capsule', from, to, radiusMeters: 0.4 };
    expect(applyTerrainDamage(grid, damage)).toBeGreaterThan(0);
    expect(grid.version).toBe(1);
    for (let sample = 0; sample <= 200; sample++) {
      const point = {
        x: from.x + ((to.x - from.x) * sample) / 200,
        y: from.y + ((to.y - from.y) * sample) / 200,
      };
      expect(circleTouchesTerrain(grid, point, 0.2)).toBe(false);
    }
    expect(grid.getMaterialAtCell(0, 0)).toBe(cells[0]);
    expect(applyTerrainDamage(grid, damage)).toBe(0);
    expect(grid.version).toBe(1);
    const replay = new TerrainGrid(50, 50, 0.2, cells);
    applyTerrainDamage(replay, JSON.parse(JSON.stringify(damage)));
    expect(replay.cells).toEqual(grid.cells);
  });

  it('treats a zero-length capsule as a circle and ignores invalid or remote operations', () => {
    const cells = new Uint8Array(100).fill(Material.Rock);
    const first = new TerrainGrid(10, 10, 1, cells);
    const second = new TerrainGrid(10, 10, 1, cells);
    first.removeCapsule({ x: 5, y: 5 }, { x: 5, y: 5 }, 2);
    second.removeCircle({ x: 5, y: 5 }, 2);
    expect(first.cells).toEqual(second.cells);
    expect(first.removeCapsule({ x: NaN, y: 0 }, { x: 1, y: 0 }, 1)).toBe(0);
    expect(first.removeCapsule({ x: 0, y: 0 }, { x: 1, y: 0 }, 0)).toBe(0);
    expect(first.removeCapsule({ x: -100, y: -100 }, { x: -99, y: -100 }, 1)).toBe(0);
    expect(first.version).toBe(1);
  });
});
