export type TerrainSmoothingQuality = 1 | 2 | 4 | 8 | 16;

export interface TerrainSmoothingSettings {
  /** False samples exact cell occupancy; material textures remain full resolution. */
  enabled: boolean;
  /** Centered coverage samples per pixel axis: 1x1 through 16x16. */
  quality: TerrainSmoothingQuality;
}

export const defaultTerrainSmoothingSettings: TerrainSmoothingSettings = {
  enabled: true,
  quality: 4,
};

export function terrainSmoothingKey(settings: TerrainSmoothingSettings): string {
  return `${settings.enabled ? 1 : 0}:${settings.quality}`;
}

export function isTerrainSmoothingQuality(value: number): value is TerrainSmoothingQuality {
  return value === 1 || value === 2 || value === 4 || value === 8 || value === 16;
}
