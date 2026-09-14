import { TerrainMaterialId } from '../terrain/TerrainMaterialId';

/** Visuals only: the renderer never needs material physics definitions. */
export const terrainMaterialVisuals = {
  [TerrainMaterialId.Soil]: { body: [61, 53, 42], edge: [133, 147, 113], surface: [79, 76, 57] },
  [TerrainMaterialId.Rock]: { body: [52, 60, 68], edge: [125, 138, 147], surface: [72, 82, 91] },
} as const;
