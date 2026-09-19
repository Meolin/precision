export type TerrainSmoothingQuality = 1 | 2 | 4;

export interface TerrainSmoothingSettings {
  enabled: boolean;
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
  return value === 1 || value === 2 || value === 4;
}
