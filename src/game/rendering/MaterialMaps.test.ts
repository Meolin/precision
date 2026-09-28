import { describe, expect, it } from 'vitest';
import { buildMaterialMapPixels, normalMapAssetUrl } from './MaterialMaps';

describe('material maps', () => {
  it('locates a supplied normal map beside its albedo', () => {
    expect(normalMapAssetUrl('/Textures/Environment/Stone_example2.png')).toBe(
      '/Textures/Environment/Stone_example2_normal.png',
    );
  });
  it('keeps a flat albedo at constant height with a forward normal', () => {
    const pixels = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 128;
      pixels[i + 3] = 255;
    }
    const maps = buildMaterialMapPixels(pixels, 4, 4);
    expect(maps.heightPixels[0]).toBe(maps.heightPixels[4]);
    expect([...maps.normalPixels.slice(0, 4)]).toEqual([128, 128, 255, 255]);
  });

  it('raises bright details and tilts normals toward falling height', () => {
    const pixels = new Uint8ClampedArray(5 * 5 * 4);
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 5; x++) {
        const offset = (y * 5 + x) * 4;
        pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = x * 50;
        pixels[offset + 3] = 255;
      }
    const maps = buildMaterialMapPixels(pixels, 5, 5);
    expect(maps.heightPixels[(2 * 5 + 3) * 4]).toBeGreaterThan(
      maps.heightPixels[(2 * 5 + 1) * 4] ?? 0,
    );
    expect(maps.normalPixels[(2 * 5 + 2) * 4]).toBeLessThan(128);
  });
});
