import { describe, expect, it } from 'vitest';
import {
  defaultTerrainSmoothingSettings,
  isTerrainSmoothingQuality,
  terrainSmoothingKey,
} from './TerrainSmoothingSettings';

describe('terrain smoothing settings', () => {
  it('defaults to the 4x4 coverage tier', () => {
    expect(defaultTerrainSmoothingSettings).toEqual({ enabled: true, quality: 4 });
  });

  it('accepts only supported quality levels and keys visual changes', () => {
    expect([1, 2, 4, 8, 16].every(isTerrainSmoothingQuality)).toBe(true);
    expect([0, 3, 5, 32].some(isTerrainSmoothingQuality)).toBe(false);
    expect(terrainSmoothingKey({ enabled: true, quality: 2 })).toBe('1:2');
    expect(terrainSmoothingKey({ enabled: true, quality: 8 })).toBe('1:8');
    expect(terrainSmoothingKey({ enabled: true, quality: 16 })).toBe('1:16');
    expect(terrainSmoothingKey({ enabled: false, quality: 2 })).toBe('0:2');
  });
});
