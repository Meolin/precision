import { describe, expect, it } from 'vitest';
import {
  defaultTerrainSmoothingSettings,
  isTerrainSmoothingQuality,
  terrainSmoothingKey,
} from './TerrainSmoothingSettings';

describe('terrain smoothing settings', () => {
  it('keeps the current four-pixel smoothing as the default', () => {
    expect(defaultTerrainSmoothingSettings).toEqual({ enabled: true, quality: 4 });
  });

  it('accepts only supported quality levels and keys visual changes', () => {
    expect([1, 2, 4].every(isTerrainSmoothingQuality)).toBe(true);
    expect([0, 3, 8].some(isTerrainSmoothingQuality)).toBe(false);
    expect(terrainSmoothingKey({ enabled: true, quality: 2 })).toBe('1:2');
    expect(terrainSmoothingKey({ enabled: false, quality: 2 })).toBe('0:2');
  });
});
