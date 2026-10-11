import { afterEach, describe, expect, it, vi } from 'vitest';
import { cloneConfig } from '../config/defaultGameConfig';
import { generateTerrain } from '../terrain/generateTerrain';
import { TerrainMaterialId } from '../terrain/TerrainMaterialId';
import { loadRockLayerMask } from './loadRockLayerMask';

afterEach(() => vi.unstubAllGlobals());

describe('Rock contour loading', () => {
  it.each(['stone_1', 'stone_1_mixed'])(
    'uses density instead of alpha to build authoritative cells for %s',
    async (rockTextureId) => {
      let decodedSource = '';
      vi.stubGlobal(
        'Image',
        class {
          src = '';
          naturalWidth = 2;
          naturalHeight = 2;
          async decode() {
            decodedSource = this.src;
          }
        },
      );
      const context = {
        drawImage: vi.fn(),
        getImageData: () => ({
          // Density has a recessed left edge; alpha is uniformly white.
          data: new Uint8ClampedArray([
            ...(decodedSource.endsWith('_density.png') ? [0, 0, 0, 255] : [255, 255, 255, 255]),
            255,
            255,
            255,
            255,
            255,
            255,
            255,
            255,
            255,
            255,
            255,
            255,
          ]),
        }),
      };
      vi.stubGlobal('document', {
        createElement: () => ({ width: 0, height: 0, getContext: () => context }),
      });

      const mask = await loadRockLayerMask({ rockTextureId, orientation: 'sequential' });
      expect(decodedSource).toBe('/Textures/Environment/stone_1_density.png');
      expect(mask?.sourceId).toBe(`${rockTextureId}:${decodedSource}`);

      const config = cloneConfig();
      config.world.widthMeters = 20;
      config.world.heightMeters = 40;
      Object.assign(config.terrain, {
        cellSizeMeters: 0.2,
        surfaceHeightFraction: 0.25,
        waveAmplitudeMeters: 0,
        noiseAmplitudeMeters: 0,
        rockDepthMeters: 12,
        rockVariationMeters: 0,
        rockLayerMask: mask,
      });
      const terrain = generateTerrain(config, 12345);
      expect(terrain.getMaterialAtWorldPosition({ x: 4.8, y: 23 })).toBe(TerrainMaterialId.Soil);
      expect(terrain.getMaterialAtWorldPosition({ x: 14.4, y: 23 })).toBe(TerrainMaterialId.Rock);
    },
  );
});
