import { describe, expect, it } from 'vitest';
import {
  defaultTerrainTextureSettings,
  isTerrainRockTextureId,
  isTerrainTextureOrientation,
  terrainRockContourAssetUrl,
  terrainRockTextureAsset,
  terrainTextureKey,
} from './TerrainTextureSettings';

describe('terrain texture settings', () => {
  it('prefers density over alpha for ordinary and combined Rock contours', () => {
    for (const id of ['stone_1', 'stone_1_mixed']) {
      expect(terrainRockContourAssetUrl(terrainRockTextureAsset(id))).toBe(
        '/Textures/Environment/stone_1_density.png',
      );
    }
  });

  it('falls back to alpha only when density is absent', () => {
    const asset = terrainRockTextureAsset('stone_1');
    const alphaOnly = {
      id: asset.id,
      label: asset.label,
      assetUrl: asset.assetUrl,
      alphaAssetUrl: asset.alphaAssetUrl,
      format: asset.format,
    };
    expect(terrainRockContourAssetUrl(alphaOnly)).toBe('/Textures/Environment/stone_1_alpha.png');
    expect(terrainRockContourAssetUrl(terrainRockTextureAsset('Stone_example'))).toBeUndefined();
  });

  it('keeps mirrored tiling as the default', () => {
    expect(defaultTerrainTextureSettings).toEqual({
      rockTextureId: 'Stone_example',
      orientation: 'mirrored',
    });
  });

  it('accepts only supported texture orientations', () => {
    expect(
      ['mirrored', 'sequential', 'mirror-x', 'random'].every(isTerrainTextureOrientation),
    ).toBe(true);
    expect(isTerrainTextureOrientation('rotate')).toBe(false);
    expect(terrainTextureKey({ rockTextureId: 'Stone_example2', orientation: 'random' })).toBe(
      'Stone_example2:random',
    );
  });

  it('exposes regular and combined rock assets', () => {
    expect(isTerrainRockTextureId('Stone_example')).toBe(true);
    expect(isTerrainRockTextureId('Stone_example2')).toBe(true);
    expect(isTerrainRockTextureId('stone_1')).toBe(true);
    expect(isTerrainRockTextureId('stone_1_mixed')).toBe(true);
    expect(isTerrainRockTextureId('stone_2_mixed')).toBe(true);
    expect(isTerrainRockTextureId('Soil_example')).toBe(false);
    expect(isTerrainRockTextureId('stone_1_density')).toBe(false);
    expect(terrainRockTextureAsset('stone_1').densityAssetUrl).toBe(
      '/Textures/Environment/stone_1_density.png',
    );
    expect(terrainRockTextureAsset('stone_1_mixed').densityAssetUrl).toBe(
      '/Textures/Environment/stone_1_density.png',
    );
    expect(terrainRockTextureAsset('Stone_example').densityAssetUrl).toBeUndefined();
    expect(terrainRockTextureAsset('Stone_example2').assetUrl).toBe(
      '/Textures/Environment/Stone_example2.png',
    );
    expect(terrainRockTextureAsset('stone_1_mixed').format).toBe('albedo-normal-horizontal');
    expect(terrainRockTextureAsset('stone_1_mixed').alphaAssetUrl).toBe(
      '/Textures/Environment/stone_1_alpha.png',
    );
    expect(terrainRockTextureAsset('stone_1').format).toBe('albedo');
    expect(terrainRockTextureAsset('stone_1').alphaAssetUrl).toBe(
      '/Textures/Environment/stone_1_alpha.png',
    );
  });
});
