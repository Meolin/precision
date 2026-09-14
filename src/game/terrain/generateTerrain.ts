import type { GameConfig } from '../config/GameConfig';
import { clamp } from '../math/Vec2';
import { TerrainGrid } from './TerrainGrid';

export function createSeededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateTerrain(config: GameConfig, seed: number): TerrainGrid {
  const { widthMeters, heightMeters } = config.world;
  const {
    cellSizeMeters: cell,
    surfaceHeightFraction,
    waveAmplitudeMeters,
    noiseAmplitudeMeters,
  } = config.terrain;
  const columns = Math.ceil(widthMeters / cell);
  const rows = Math.ceil(heightMeters / cell);
  const cells = new Uint8Array(columns * rows);
  const random = createSeededRandom(seed);
  const phase = random() * Math.PI * 2;
  const secondPhase = random() * Math.PI * 2;
  let noise = 0;
  for (let column = 0; column < columns; column++) {
    const u = column / columns;
    noise = noise * 0.92 + (random() - 0.5) * 0.08;
    const surface =
      heightMeters * surfaceHeightFraction +
      waveAmplitudeMeters *
        (Math.sin(u * Math.PI * 3 + phase) + 0.45 * Math.sin(u * Math.PI * 7 + secondPhase)) +
      noise * noiseAmplitudeMeters;
    const firstRow = clamp(Math.floor(surface / cell), 1, rows - 1);
    for (let row = firstRow; row < rows; row++) cells[row * columns + column] = 1;
  }
  return new TerrainGrid(columns, rows, cell, cells);
}
