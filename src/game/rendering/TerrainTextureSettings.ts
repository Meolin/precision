export const terrainTextureOrientations = ['mirrored', 'sequential', 'mirror-x', 'random'] as const;

export type TerrainTextureOrientation = (typeof terrainTextureOrientations)[number];

export interface TerrainTextureSettings {
  orientation: TerrainTextureOrientation;
}

export const defaultTerrainTextureSettings: TerrainTextureSettings = {
  orientation: 'mirrored',
};

export function isTerrainTextureOrientation(value: string): value is TerrainTextureOrientation {
  return terrainTextureOrientations.some((orientation) => orientation === value);
}

export function terrainTextureKey(settings: TerrainTextureSettings): string {
  return settings.orientation;
}
