import { TerrainMaterialId } from '../terrain/TerrainMaterialId';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import type { Vec2 } from '../math/Vec2';

export type TerrainVisualColor = readonly [red: number, green: number, blue: number];
export type SolidTerrainMaterialId = Exclude<TerrainMaterialId, typeof TerrainMaterialId.Air>;

export interface TerrainMaterialVisual {
  readonly body: TerrainVisualColor;
  readonly edge: TerrainVisualColor;
  readonly surface: TerrainVisualColor;
}

/** Renderer-only registry: detailed procedural or textured variants can extend this contract. */
export const terrainMaterialVisuals: Readonly<
  Record<SolidTerrainMaterialId, TerrainMaterialVisual>
> = {
  [TerrainMaterialId.Soil]: { body: [61, 53, 42], edge: [133, 147, 113], surface: [79, 76, 57] },
  [TerrainMaterialId.Rock]: { body: [52, 60, 68], edge: [125, 138, 147], surface: [72, 82, 91] },
};

function visualColorAtCell(
  terrain: TerrainGrid,
  column: number,
  row: number,
): TerrainVisualColor | null {
  const material = terrain.getMaterialAtCell(column, row);
  if (material === TerrainMaterialId.Air) return null;
  const visual = terrainMaterialVisuals[material];
  return !terrain.isSolid(column, row - 3) ? visual.surface : visual.body;
}

function nearestVisualColor(terrain: TerrainGrid, position: Vec2): TerrainVisualColor | null {
  const cell = terrain.cellSizeMeters;
  const centerColumn = Math.floor(position.x / cell);
  const centerRow = Math.floor(position.y / cell);
  let nearest: TerrainVisualColor | null = null;
  let nearestDistanceSquared = Infinity;
  for (let row = centerRow - 1; row <= centerRow + 1; row++)
    for (let column = centerColumn - 1; column <= centerColumn + 1; column++) {
      const color = visualColorAtCell(terrain, column, row);
      if (!color) continue;
      const distanceSquared =
        ((column + 0.5) * cell - position.x) ** 2 + ((row + 0.5) * cell - position.y) ** 2;
      if (distanceSquared < nearestDistanceSquared) {
        nearestDistanceSquared = distanceSquared;
        nearest = color;
      }
    }
  return nearest;
}

/**
 * Creates one opaque source pixel per simulation cell. Air only receives a colour immediately
 * beside solid terrain, so Canvas linear scaling cannot bleed black into the alpha-masked edge.
 */
export function buildTerrainMaterialPixels(
  terrain: TerrainGrid,
  transparentAir = false,
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(terrain.columns * terrain.rows * 4);
  for (let row = 0; row < terrain.rows; row++)
    for (let column = 0; column < terrain.columns; column++) {
      const index = (row * terrain.columns + column) * 4;
      const color = visualColorAtCell(terrain, column, row);
      pixels[index] = color?.[0] ?? 0;
      pixels[index + 1] = color?.[1] ?? 0;
      pixels[index + 2] = color?.[2] ?? 0;
      pixels[index + 3] = color || !transparentAir ? 255 : 0;
    }

  if (transparentAir) return pixels;

  // Populate only the one-cell air border. This avoids black linear-filter seams without an
  // additional nearest-solid search through empty sky after terrain changes.
  for (let row = 0; row < terrain.rows; row++)
    for (let column = 0; column < terrain.columns; column++) {
      const color = visualColorAtCell(terrain, column, row);
      if (!color) continue;
      for (
        let nearbyRow = Math.max(0, row - 1);
        nearbyRow <= Math.min(terrain.rows - 1, row + 1);
        nearbyRow++
      )
        for (
          let nearbyColumn = Math.max(0, column - 1);
          nearbyColumn <= Math.min(terrain.columns - 1, column + 1);
          nearbyColumn++
        ) {
          if (terrain.isSolid(nearbyColumn, nearbyRow)) continue;
          const index = (nearbyRow * terrain.columns + nearbyColumn) * 4;
          pixels[index] = color[0];
          pixels[index + 1] = color[1];
          pixels[index + 2] = color[2];
        }
    }
  return pixels;
}

/**
 * Bilinearly sample visual material colour in world space. Air contributes no weight, preventing
 * dark seams at the smoothed alpha edge and between different solid materials.
 */
export function terrainColorAtWorldPosition(
  terrain: TerrainGrid,
  position: Vec2,
): TerrainVisualColor | null {
  const cell = terrain.cellSizeMeters;
  const gridX = position.x / cell - 0.5;
  const gridY = position.y / cell - 0.5;
  const left = Math.floor(gridX);
  const top = Math.floor(gridY);
  const fractionX = gridX - left;
  const fractionY = gridY - top;
  const samples = [
    { column: left, row: top, weight: (1 - fractionX) * (1 - fractionY) },
    { column: left + 1, row: top, weight: fractionX * (1 - fractionY) },
    { column: left, row: top + 1, weight: (1 - fractionX) * fractionY },
    { column: left + 1, row: top + 1, weight: fractionX * fractionY },
  ];
  const color = [0, 0, 0];
  let totalWeight = 0;
  for (const sample of samples) {
    const value = visualColorAtCell(terrain, sample.column, sample.row);
    if (!value || sample.weight <= 0) continue;
    totalWeight += sample.weight;
    color[0] = (color[0] ?? 0) + value[0] * sample.weight;
    color[1] = (color[1] ?? 0) + value[1] * sample.weight;
    color[2] = (color[2] ?? 0) + value[2] * sample.weight;
  }
  if (totalWeight === 0) return nearestVisualColor(terrain, position);
  return [
    Math.round((color[0] ?? 0) / totalWeight),
    Math.round((color[1] ?? 0) / totalWeight),
    Math.round((color[2] ?? 0) / totalWeight),
  ];
}
