import { describe, expect, it, vi } from 'vitest';
import { GlProgram, Texture } from 'pixi.js';
import {
  TerrainChunkMesh,
  terrainTextureFormatIndex,
  terrainTextureOrientationIndex,
  terrainTextureWorldSize,
} from './TerrainChunkMesh';
import { createSceneLighting } from './SceneLighting';
import { createShaderSettings } from './ShaderSettings';
import type { TerrainGlowSource } from './TerrainGlowSource';

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

  it('addresses regular and horizontally combined material textures', () => {
    expect(terrainTextureFormatIndex('albedo')).toBe(0);
    expect(terrainTextureFormatIndex('albedo-normal-horizontal')).toBe(1);
  });
});

describe('terrain chunk material settings', () => {
  it('uploads multiple world lights beside the normal map and clears them on global disable', () => {
    const program = vi.spyOn(GlProgram, 'from').mockReturnValue({} as GlProgram);
    const mesh = new TerrainChunkMesh({
      fieldTexture: Texture.WHITE,
      soilTexture: Texture.WHITE,
      rockTexture: Texture.WHITE,
      rockAlphaTexture: null,
      rockTextureFormat: 'albedo',
      chunkOriginMeters: [0, 0],
      chunkSizeMeters: [8, 8],
      fieldSize: [12, 12],
      smoothing: { enabled: true, quality: 4 },
      orientation: 'sequential',
    });
    try {
      mesh.setMaterialMaps({ height: Texture.WHITE, normal: Texture.WHITE });
      const settings = createShaderSettings();
      mesh.setLighting(
        createSceneLighting(settings, { x: 1, y: 2 }, [], 0, [
          { position: [6, 7], radius: 2, intensity: 3, color: 0xff0000 },
        ]),
      );
      const values = (mesh as unknown as { uniforms: { uniforms: Record<string, unknown> } })
        .uniforms.uniforms;
      expect(values.uMaterialMapsReady).toBe(1);
      expect(values.uLightCount).toBe(2);
      expect(Array.from((values.uLights as Float32Array).slice(0, 4))).toEqual([6, 7, 2, 3]);
      expect(Array.from((values.uLightColors as Float32Array).slice(0, 4))).toEqual([1, 0, 0, 1]);
      const glow: TerrainGlowSource = {
        mask: Texture.WHITE,
        worldToMask: [0.5, 0, 0, 0.5, 0, 0],
        haloBasis: [2, 0, 0, 2],
        bounds: [-1, -1, 6, 6],
        strength: 2,
        opacity: 0.25,
        color: 0x00ff00,
      };
      mesh.setLighting(createSceneLighting(settings, null, [], 0, [], [glow]));
      expect(values.uLightCount).toBe(0);
      expect(values.uGlowCount).toBe(1);
      expect(Array.from((values.uGlowMatrices as Float32Array).slice(0, 4))).toEqual([
        0.5, 0, 0, 0.5,
      ]);
      expect(Array.from((values.uGlowColors as Float32Array).slice(0, 4))).toEqual([0, 1, 0, 1]);
      const shader = (mesh as unknown as { shader: { resources: Record<string, unknown> } }).shader;
      expect(shader.resources.uGlowMask0).toBe(Texture.WHITE.source);
      settings.enabled = false;
      mesh.setLighting(createSceneLighting(settings, { x: 1, y: 2 }, [], 0, []));
      expect(values.uLightCount).toBe(0);
      expect(values.uGlowCount).toBe(0);
      expect(shader.resources.uGlowMask0).toBe(Texture.EMPTY.source);
      expect(values.uLightingEnabled).toBe(0);
      expect((values.uLights as Float32Array).every((value) => value === 0)).toBe(true);
    } finally {
      mesh.destroy();
      program.mockRestore();
    }
  });

  it('updates the sample tier and mirrors material settings to a minimap instance', () => {
    const program = vi.spyOn(GlProgram, 'from').mockReturnValue({} as GlProgram);
    const mesh = new TerrainChunkMesh({
      fieldTexture: Texture.WHITE,
      soilTexture: Texture.WHITE,
      rockTexture: Texture.WHITE,
      rockAlphaTexture: null,
      rockTextureFormat: 'albedo',
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
