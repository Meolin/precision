import type { GameConfig } from '../config/GameConfig';
import { clamp } from '../math/Vec2';
import { TerrainGrid } from './TerrainGrid';
import { TerrainMaterialId } from './TerrainMaterialId';

export function createSeededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed defines one continuous profile, independently of the collision grid resolution. */
export function createTerrainSurface(
  config: GameConfig,
  seed: number,
): (xMeters: number) => number {
  const { widthMeters, heightMeters } = config.world;
  const { surfaceHeightFraction, waveAmplitudeMeters, noiseAmplitudeMeters } = config.terrain;
  const random = createSeededRandom(seed);
  const phase = random() * Math.PI * 2;
  const secondPhase = random() * Math.PI * 2;
  const noiseSpacingMeters = 12;
  const noise = Float64Array.from(
    { length: Math.ceil(widthMeters / noiseSpacingMeters) + 1 },
    () => random() - 0.5,
  );
  return (xMeters) => {
    const x = clamp(xMeters, 0, widthMeters);
    const u = x / widthMeters;
    const position = x / noiseSpacingMeters;
    const index = Math.min(Math.floor(position), noise.length - 2);
    const t = position - index;
    // Quintic interpolation has continuous first and second derivatives at noise knots.
    const blend = t * t * t * (t * (t * 6 - 15) + 10);
    const localNoise = noise[index]! + (noise[index + 1]! - noise[index]!) * blend;
    return (
      heightMeters * surfaceHeightFraction +
      waveAmplitudeMeters *
        (Math.sin(u * Math.PI * 3 + phase) + 0.45 * Math.sin(u * Math.PI * 7 + secondPhase)) +
      localNoise * noiseAmplitudeMeters
    );
  };
}

export function generateTerrain(config: GameConfig, seed: number): TerrainGrid {
  const { widthMeters, heightMeters } = config.world;
  const { cellSizeMeters: cell, rockDepthMeters, rockVariationMeters } = config.terrain;
  const columns = Math.ceil(widthMeters / cell);
  const rows = Math.ceil(heightMeters / cell);
  const cells = new Uint8Array(columns * rows);
  const initialSurfaceMeters: number[] = [];
  const surfaceAt = createTerrainSurface(config, seed);
  // Material variation does not affect the surface profile.
  const rockPhase = createSeededRandom(seed ^ 0x7f4a7c15)() * Math.PI * 2;
  for (let column = 0; column < columns; column++) {
    const x = Math.min((column + 0.5) * cell, widthMeters);
    const u = x / widthMeters;
    const surface = surfaceAt(x);
    // A row is solid when its centre lies on/below the continuous surface.
    // This bounds vertical rasterization error to half a cell away from world limits.
    const firstRow = clamp(Math.ceil(surface / cell - 0.5), 1, rows - 1);
    initialSurfaceMeters.push(
      firstRow === Math.ceil(surface / cell - 0.5) ? surface : firstRow * cell,
    );
    const rockDepth =
      rockDepthMeters === null
        ? Infinity
        : Math.max(
            cell,
            rockDepthMeters + Math.sin(u * Math.PI * 5 + rockPhase) * rockVariationMeters,
          );
    for (let row = firstRow; row < rows; row++)
      cells[row * columns + column] =
        (row + 0.5) * cell - surface >= rockDepth ? TerrainMaterialId.Rock : TerrainMaterialId.Soil;
  }
  return new TerrainGrid(
    columns,
    rows,
    cell,
    cells,
    config.terrain.chunkSizeCells,
    initialSurfaceMeters,
  );
}
