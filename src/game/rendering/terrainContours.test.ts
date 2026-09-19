import { describe, expect, it } from 'vitest';
import { TerrainGrid } from '../terrain/TerrainGrid';
import { TerrainMaterialId as Material } from '../terrain/TerrainMaterialId';

function terrainFromRows(rows: readonly string[]): TerrainGrid {
  const columns = rows[0]?.length ?? 0;
  if (columns === 0 || rows.some((row) => row.length !== columns))
    throw new Error('Test terrain rows must be non-empty and have equal width.');
  const cells = new Uint8Array(columns * rows.length);
  rows.forEach((row, y) =>
    [...row].forEach((cell, x) => {
      if (cell === '#') cells[y * columns + x] = Material.Soil;
    }),
  );
  return new TerrainGrid(columns, rows.length, 1, cells, 2);
}

/** Historical contour regressions retained against the replacement binary-mask boundary. */
describe('terrain visual boundary migration', () => {
  it('preserves holes, narrow walls, channels and diagonal cells without polygon reconstruction', () => {
    for (const rows of [
      ['#####', '#####', '##.##', '#####', '#####'],
      ['..#..', '..#..', '..#..', '..#..'],
      ['##.##', '##.##', '##.##', '##.##'],
      ['#.', '.#'],
    ]) {
      const terrain = terrainFromRows(rows);
      rows.forEach((row, y) =>
        [...row].forEach((cell, x) => expect(terrain.isSolid(x, y)).toBe(cell === '#')),
      );
    }
  });

  it('keeps map-edge damage bounded and publishes a local dirty rectangle', () => {
    const terrain = terrainFromRows(['.##', '###', '###']);
    const change = terrain.destroyCircle({ x: 0, y: 0 }, 1.5);
    expect(change.changed).toBe(true);
    expect(change.dirtyRect?.minX).toBe(0);
    expect(change.dirtyRect?.minY).toBe(1);
    expect(change.affectedChunks.length).toBeLessThanOrEqual(1);
  });

  it('is deterministic and does not mutate while queried', () => {
    const terrain = terrainFromRows(['#....', '##...', '###..', '####.', '#####']);
    const before = terrain.cells.slice();
    const version = terrain.version;
    const first = Array.from({ length: terrain.rows }, (_, y) =>
      Array.from({ length: terrain.columns }, (_, x) => terrain.isSolid(x, y)),
    );
    const second = Array.from({ length: terrain.rows }, (_, y) =>
      Array.from({ length: terrain.columns }, (_, x) => terrain.isSolid(x, y)),
    );
    expect(second).toEqual(first);
    expect(terrain.cells).toEqual(before);
    expect(terrain.version).toBe(version);
  });
});
