export const terrainTextureOrientations = ['mirrored', 'sequential', 'mirror-x', 'random'] as const;

export type TerrainTextureOrientation = (typeof terrainTextureOrientations)[number];
export type TerrainTextureFormat = 'albedo' | 'albedo-normal-horizontal';

export interface TerrainRockTextureAsset {
  readonly id: string;
  readonly label: string;
  readonly assetUrl: string;
  readonly alphaAssetUrl?: string;
  readonly format: TerrainTextureFormat;
}

export const terrainRockTextureAssets: readonly TerrainRockTextureAsset[] =
  __TERRAIN_ROCK_TEXTURE_ASSETS__;

export const terrainSoilTextureAsset = {
  assetUrl: '/Textures/Environment/soil_1.png',
  normalAssetUrl: '/Textures/Environment/soil_1_normal.png',
  format: 'albedo' as const,
};

export type TerrainRockTextureId = string;

export interface TerrainTextureSettings {
  rockTextureId: TerrainRockTextureId;
  orientation: TerrainTextureOrientation;
}

export const defaultTerrainTextureSettings: TerrainTextureSettings = {
  rockTextureId: 'Stone_example',
  orientation: 'mirrored',
};

export function isTerrainTextureOrientation(value: string): value is TerrainTextureOrientation {
  return terrainTextureOrientations.some((orientation) => orientation === value);
}

export function isTerrainRockTextureId(value: string): value is TerrainRockTextureId {
  return terrainRockTextureAssets.some((asset) => asset.id === value);
}

export function terrainRockTextureAsset(id: TerrainRockTextureId) {
  const asset = terrainRockTextureAssets.find((candidate) => candidate.id === id);
  if (!asset) throw new Error(`Unknown terrain rock texture: ${id}`);
  return asset;
}

export function terrainTextureKey(settings: TerrainTextureSettings): string {
  return `${settings.rockTextureId}:${settings.orientation}`;
}
