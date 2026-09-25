import { describe, expect, it, vi } from 'vitest';
import { GlProgram, Texture } from 'pixi.js';
import {
  TerrainChunkMesh,
  terrainTextureOrientationIndex,
  terrainTextureWorldSize,
} from './TerrainChunkMesh';

describe('terrain chunk material coordinates', () => {
  it('preserves source aspect ratio in world-space tiles', () => {
    expect(terrainTextureWorldSize(1200, 600)).toEqual([19.2, 9.6]);
    expect(terrainTextureWorldSize(600, 1200)).toEqual([19.2, 38.4]);
  });

  it('keeps every existing orientation addressable by the shader', () => {
    expect(
      ['mirrored', 'sequential', 'mirror-x', 'random'].map((orientation) =>
        terrainTextureOrientationIndex(
          orientation as Parameters<typeof terrainTextureOrientationIndex>[0],
        ),
      ),
    ).toEqual([0, 1, 2, 3]);
  });

  it('rejects invalid texture dimensions instead of compressing them', () => {
    expect(() => terrainTextureWorldSize(0, 100)).toThrow();
  });
});

describe('terrain chunk material settings', () => {
  it('updates the sample tier and mirrors material settings to a minimap instance', () => {
    const program = vi.spyOn(GlProgram, 'from').mockReturnValue({} as GlProgram);
    const mesh = new TerrainChunkMesh({
      fieldTexture: Texture.WHITE,
      rockTexture: Texture.WHITE,
      chunkOriginMeters: [0, 0],
      chunkSizeMeters: [8, 8],
      fieldSize: [12, 12],
      smoothing: { enabled: true, quality: 4 },
      orientation: 'sequential',
    });
    const minimap = mesh.createInstance();
    const uniforms = (chunk: TerrainChunkMesh) =>
      (chunk as unknown as { uniforms: { uniforms: Record<string, unknown> } }).uniforms.uniforms;

    mesh.setSettings({ enabled: false, quality: 1 }, 'random');
    minimap.syncMaterialFrom(mesh);
    expect(uniforms(minimap)).toMatchObject({
      uSmoothingEnabled: 0,
      uSmoothingQuality: 1,
      uTextureOrientation: 3,
    });
    mesh.setSettings({ enabled: true, quality: 2 }, 'mirrored');
    minimap.syncMaterialFrom(mesh);
    minimap.setDisplayRect(0, 0, 32, 16);
    minimap.setPixelsPerMeter(100);
    expect(uniforms(minimap)).toMatchObject({
      uSmoothingEnabled: 1,
      uSmoothingQuality: 2,
      uTextureOrientation: 0,
    });
    expect(uniforms(minimap).uFieldTexelSize).toEqual(new Float32Array([1 / 12, 1 / 12]));
    expect(uniforms(minimap).uFieldUvMin).toEqual(new Float32Array([2 / 12, 2 / 12]));
    expect(uniforms(minimap).uFieldUvMax).toEqual(new Float32Array([10 / 12, 10 / 12]));

    mesh.setSettings({ enabled: true, quality: 8 }, 'sequential');
    minimap.syncMaterialFrom(mesh);
    expect(uniforms(minimap).uSmoothingQuality).toBe(8);
    mesh.setSettings({ enabled: true, quality: 16 }, 'sequential');
    minimap.syncMaterialFrom(mesh);
    expect(uniforms(minimap).uSmoothingQuality).toBe(16);

    minimap.destroy();
    mesh.destroy();
    program.mockRestore();
  });
});
