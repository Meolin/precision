/** Stable byte IDs for terrain storage, snapshots and semantic events. */
export const TerrainMaterialId = { Air: 0, Soil: 1, Rock: 2 } as const;
export type TerrainMaterialId = (typeof TerrainMaterialId)[keyof typeof TerrainMaterialId];
