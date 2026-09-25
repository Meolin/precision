import { describe, expect, it } from 'vitest';
import { TerrainMaterialId as Material } from '../terrain/TerrainMaterialId';
import { buildTerrainVisualField, terrainFieldSamplePaddingCells } from './terrainVisualField';

function sample(
  source: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  originX: number,
  originY: number,
  outputWidth: number,
  outputHeight: number,
  surfaceRows?: readonly number[],
): Uint8Array {
  const padding = terrainFieldSamplePaddingCells;
  const sampleWidth = outputWidth + padding * 2;
  const sampleHeight = outputHeight + padding * 2;
  const materials = new Uint8Array(sampleWidth * sampleHeight);
  for (let y = 0; y < sampleHeight; y++)
    for (let x = 0; x < sampleWidth; x++) {
      const sourceX = originX + x - padding;
      const sourceY = originY + y - padding;
      if (sourceX < 0 || sourceY < 0 || sourceX >= sourceWidth || sourceY >= sourceHeight) continue;
      materials[y * sampleWidth + x] = source[sourceY * sourceWidth + sourceX] ?? 0;
    }
  return buildTerrainVisualField({
    materials,
    sampleWidth,
    sampleHeight,
    outputWidth,
    outputHeight,
    samplePadding: padding,
    ...(surfaceRows
      ? {
          surfaceRows: Float64Array.from({ length: sampleWidth }, (_, x) => {
            const height = surfaceRows[originX + x - padding];
            return height === undefined ? Infinity : height - originY + padding;
          }),
        }
      : {}),
  });
}

function coverage(field: Uint8Array, width: number, x: number, y: number): number {
  return field[(y * width + x) * 4] ?? 0;
}

function thresholdCrossing(from: number, to: number): number {
  return (127.5 - from) / (to - from);
}

describe('terrain visual field', () => {
  it('retains a shallow fractional surface instead of the horizontal occupancy steps', () => {
    const width = 40;
    const height = 24;
    const surface = Array.from({ length: width }, (_, x) => 7.1 + 0.08 * (x + 0.5));
    const materials = Uint8Array.from({ length: width * height }, (_, index) =>
      Math.floor(index / width) + 0.5 >= surface[index % width]! ? Material.Soil : Material.Air,
    );
    const field = sample(materials, width, height, 0, 0, width, height, surface);
    for (let x = 6; x < width - 6; x++) {
      const y = Math.floor(surface[x]! - 0.5);
      const crossing =
        y + 0.5 + thresholdCrossing(coverage(field, width, x, y), coverage(field, width, x, y + 1));
      expect(Math.abs(crossing - surface[x]!)).toBeLessThan(0.04);
    }
    const partial = sample(materials, width, height, 8, 5, 12, 8, surface);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 12; x++)
        expect(coverage(partial, 12, x, y)).toBe(coverage(field, width, x + 8, y + 5));
  });

  it('subtracts removed cells and includes added cells when a generation profile is present', () => {
    const size = 24;
    const surface = Array.from({ length: size }, () => 10.2);
    const materials = Uint8Array.from({ length: size * size }, (_, index) =>
      Math.floor(index / size) >= 10 ? Material.Soil : Material.Air,
    );
    materials[12 * size + 12] = Material.Air;
    materials[7 * size + 12] = Material.Soil;
    const field = sample(materials, size, size, 0, 0, size, size, surface);
    expect(coverage(field, size, 12, 12)).toBeLessThan(128);
    expect(coverage(field, size, 12, 7)).toBeGreaterThanOrEqual(128);
    expect(coverage(field, size, 12, 16)).toBeGreaterThanOrEqual(128);
  });

  it('encodes distances through a flat boundary instead of constant boundary-cell coverage', () => {
    const size = 32;
    const materials = Uint8Array.from({ length: size * size }, (_, index) =>
      Math.floor(index / size) >= 16 ? Material.Soil : Material.Air,
    );
    const field = sample(materials, size, size, 0, 0, size, size);
    const values = [13, 14, 15, 16, 17, 18].map((y) => coverage(field, size, 16, y));
    expect(values[2]).toBeLessThan(128);
    expect(values[3]).toBeGreaterThanOrEqual(128);
    for (let index = 1; index < values.length; index++)
      expect(values[index]).toBeGreaterThan(values[index - 1]!);
  });

  it('reconstructs different distances along the steps of a shallow slope', () => {
    const size = 32;
    const surface = (x: number) => 8 + Math.floor(x / 3);
    const materials = Uint8Array.from({ length: size * size }, (_, index) =>
      Math.floor(index / size) >= surface(index % size) ? Material.Soil : Material.Air,
    );
    const field = sample(materials, size, size, 0, 0, size, size);
    const boundaryValues = [12, 13, 14].map((x) => coverage(field, size, x, surface(x)));
    expect(new Set(boundaryValues).size).toBeGreaterThan(1);
  });

  it('preserves the authoritative side of the coverage threshold for thin topology', () => {
    const rows = ['#....', '.#...', '..#..', '...#.', '....#'];
    const materials = Uint8Array.from(rows.join(''), (cell) =>
      cell === '#' ? Material.Soil : Material.Air,
    );
    const field = sample(materials, 5, 5, 0, 0, 5, 5);
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 5; x++) {
        const index = (y * 5 + x) * 4;
        const solid = rows[y]?.[x] === '#';
        expect((field[index] ?? 0) >= 128).toBe(solid);
        expect(field[index + 3]).toBe(255);
      }
  });

  it('matches the corresponding region of a full rebuild', () => {
    const width = 12;
    const height = 9;
    const materials = Uint8Array.from({ length: width * height }, (_, index) => {
      const x = index % width;
      const y = Math.floor(index / width);
      if (y < 2 + (x % 4)) return Material.Air;
      return y > 6 ? Material.Rock : Material.Soil;
    });
    const full = sample(materials, width, height, 0, 0, width, height);
    const localX = 4;
    const localY = 2;
    const localWidth = 5;
    const localHeight = 4;
    const local = sample(materials, width, height, localX, localY, localWidth, localHeight);
    for (let y = 0; y < localHeight; y++)
      for (let x = 0; x < localWidth; x++) {
        const localIndex = (y * localWidth + x) * 4;
        const fullIndex = ((localY + y) * width + localX + x) * 4;
        expect(local.slice(localIndex, localIndex + 4)).toEqual(
          full.slice(fullIndex, fullIndex + 4),
        );
      }
  });

  it('keeps a one-cell solid feature and an air channel one cell wide under bilinear filtering', () => {
    const size = 9;
    const isolated = new Uint8Array(size * size);
    isolated[4 * size + 4] = Material.Soil;
    const isolatedField = sample(isolated, size, size, 0, 0, size, size);
    const isolatedCenter = coverage(isolatedField, size, 4, 4);
    const isolatedNeighbor = coverage(isolatedField, size, 5, 4);
    expect(thresholdCrossing(isolatedCenter, isolatedNeighbor)).toBeGreaterThanOrEqual(0.5);

    const channel = new Uint8Array(size * size).fill(Material.Soil);
    for (let y = 0; y < size; y++) channel[y * size + 4] = Material.Air;
    const channelField = sample(channel, size, size, 0, 0, size, size);
    const channelCenter = coverage(channelField, size, 4, 4);
    const channelNeighbor = coverage(channelField, size, 5, 4);
    expect(thresholdCrossing(channelCenter, channelNeighbor)).toBeGreaterThanOrEqual(0.5);
  });

  it('uses sufficient context for a local rebuild to match full surface shading', () => {
    const width = 32;
    const height = 32;
    const materials = new Uint8Array(width * height).fill(Material.Soil);
    const full = sample(materials, width, height, 0, 0, width, height);
    const localX = 8;
    const localY = 8;
    const localWidth = 8;
    const localHeight = 8;
    const local = sample(materials, width, height, localX, localY, localWidth, localHeight);
    for (let y = 0; y < localHeight; y++)
      for (let x = 0; x < localWidth; x++) {
        const localIndex = (y * localWidth + x) * 4;
        const fullIndex = ((localY + y) * width + localX + x) * 4;
        expect(local.slice(localIndex, localIndex + 4)).toEqual(
          full.slice(fullIndex, fullIndex + 4),
        );
      }
  });

  it('keeps distance data in opaque air texels and occupancy in the distance sign', () => {
    const materials = Uint8Array.from([
      Material.Air,
      Material.Soil,
      Material.Rock,
      Material.Air,
      Material.Soil,
      Material.Rock,
    ]);
    const field = sample(materials, 3, 2, 0, 0, 3, 2);
    expect(field[3]).toBe(255);
    expect(field[7]).toBe(255);
    expect(field[5]).toBeLessThan(128);
    expect(field[9]).toBeGreaterThan(128);
    expect(field[0]).toBeLessThan(128);
    expect(field[4]).toBeGreaterThanOrEqual(128);
  });
});
