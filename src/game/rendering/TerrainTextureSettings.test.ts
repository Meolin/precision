import { describe, expect, it } from 'vitest';
import {
  defaultTerrainTextureSettings,
  isTerrainTextureOrientation,
  terrainTextureKey,
} from './TerrainTextureSettings';

describe('terrain texture settings', () => {
  it('keeps mirrored tiling as the default', () => {
    expect(defaultTerrainTextureSettings).toEqual({ orientation: 'mirrored' });
  });

  it('accepts only supported texture orientations', () => {
    expect(
      ['mirrored', 'sequential', 'mirror-x', 'random'].every(isTerrainTextureOrientation),
    ).toBe(true);
    expect(isTerrainTextureOrientation('rotate')).toBe(false);
    expect(terrainTextureKey({ orientation: 'random' })).toBe('random');
  });
});
