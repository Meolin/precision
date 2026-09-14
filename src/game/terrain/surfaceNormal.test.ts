import { describe, expect, it } from 'vitest';
import { isValidNormal } from '../math/Vec2';
import { TerrainGrid } from './TerrainGrid';
import { TerrainMaterialId as Material } from './TerrainMaterialId';
import { calculateSurfaceNormal } from './surfaceNormal';
import { sweepTerrain } from './terrainCollision';

function grid(solid: (x: number, y: number) => boolean, material: Material = Material.Rock) {
  const terrain = new TerrainGrid(40, 40, 0.2);
  for (let y = 0; y < 40; y++)
    for (let x = 0; x < 40; x++) if (solid(x, y)) terrain.setMaterial(x, y, material);
  return terrain;
}

describe('surface normals from occupancy', () => {
  it('returns up for a floor and left for a wall, including projectile radius', () => {
    const floor = sweepTerrain(
      grid((_, y) => y >= 20),
      { x: 4, y: 3 },
      { x: 4, y: 5 },
      0.6,
    )!;
    expect(floor.normal.x).toBeCloseTo(0);
    expect(floor.normal.y).toBeCloseTo(-1);
    expect(floor.contactPoint.y).toBe(4);
    expect(floor.position.y).toBeCloseTo(3.4, 2);
    const wall = sweepTerrain(
      grid((x) => x >= 20),
      { x: 3, y: 4 },
      { x: 5, y: 4 },
      0.1,
    )!;
    expect(wall.normal.x).toBeCloseTo(-1);
    expect(wall.normal.y).toBeCloseTo(0);
  });

  it('approximates a 45 degree slope and stays stable along adjacent cells', () => {
    const slope = grid((x, y) => y >= x);
    for (const x of [15, 16, 17, 18]) {
      const normal = calculateSurfaceNormal(
        slope,
        { x: (x + 0.5) * 0.2, y: (x + 0.5) * 0.2 },
        { x: 0, y: 1 },
      );
      expect(normal.x).toBeCloseTo(Math.SQRT1_2);
      expect(normal.y).toBeCloseTo(-Math.SQRT1_2);
      expect(Math.hypot(normal.x, normal.y)).toBeCloseTo(1);
    }
  });

  it('treats all solid materials equally and responds to terrain edits', () => {
    const rock = grid((_, y) => y >= 20);
    const soil = grid((_, y) => y >= 20, Material.Soil);
    const position = { x: 4.1, y: 4.1 };
    expect(calculateSurfaceNormal(rock, position, { x: 1, y: 1 })).toEqual(
      calculateSurfaceNormal(soil, position, { x: 1, y: 1 }),
    );
    const before = rock.version;
    rock.removeCircle({ x: 3.7, y: 4 }, 1);
    const normal = calculateSurfaceNormal(rock, position, { x: 1, y: 1 });
    expect(normal.x).toBeLessThan(0);
    expect(rock.version).toBe(before + 1);
  });

  it.each([
    { x: 0, y: 0 },
    { x: NaN, y: Infinity },
    { x: 1e308, y: 1e308 },
    { x: 3, y: 4 },
  ])('has a finite unit fallback for ambiguous terrain and velocity %j', (velocity) => {
    for (const terrain of [grid(() => false), grid(() => true)]) {
      const normal = calculateSurfaceNormal(terrain, { x: 4, y: 4 }, velocity);
      expect(isValidNormal(normal)).toBe(true);
      expect(Math.hypot(normal.x, normal.y)).toBeCloseTo(1);
    }
  });
});
