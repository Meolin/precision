import type { GameConfig } from '../../config/GameConfig';
import { clamp } from '../../math/Vec2';
import { TerrainGrid } from '../../terrain/TerrainGrid';
import { TerrainMaterialId } from '../../terrain/TerrainMaterialId';

/** Frozen pre-smooth-generation map for the historical ballistic snapshots only. */
export function generateLegacyTerrain(
  config: GameConfig,
  seed: number,
  createRandom: (seed: number) => () => number,
): TerrainGrid {
  const { widthMeters, heightMeters } = config.world;
  const {
    cellSizeMeters: cell,
    surfaceHeightFraction,
    waveAmplitudeMeters,
    noiseAmplitudeMeters,
    rockDepthMeters,
    rockVariationMeters,
  } = config.terrain;
  const columns = Math.ceil(widthMeters / cell);
  const rows = Math.ceil(heightMeters / cell);
  const cells = new Uint8Array(columns * rows);
  const random = createRandom(seed);
  const phase = random() * Math.PI * 2;
  const secondPhase = random() * Math.PI * 2;
  const rockPhase = createRandom(seed ^ 0x7f4a7c15)() * Math.PI * 2;
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
    const rockDepth =
      rockDepthMeters === null
        ? Infinity
        : Math.max(
            cell,
            rockDepthMeters + Math.sin(u * Math.PI * 5 + rockPhase) * rockVariationMeters,
          );
    for (let row = firstRow; row < rows; row++)
      cells[row * columns + column] =
        (row - firstRow) * cell >= rockDepth ? TerrainMaterialId.Rock : TerrainMaterialId.Soil;
  }
  return new TerrainGrid(columns, rows, cell, cells, config.terrain.chunkSizeCells);
}
