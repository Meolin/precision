import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlurFilter, Filter, Matrix, Sprite, Texture, TexturePool } from 'pixi.js';
import { createSceneLighting } from '../rendering/SceneLighting';
import { createShaderSettings, withShaderValue } from '../rendering/ShaderSettings';
import { BuildingNormalMapFilter } from './BuildingNormalMapFilter';

// Exercise pass routing and uniforms without creating a WebGL context.
vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  return { ...pixi, GlProgram: { from: () => ({ destroy: vi.fn() }) } };
});

afterEach(() => vi.restoreAllMocks());

function setup() {
  const sprite = new Sprite(Texture.WHITE);
  const filter = new BuildingNormalMapFilter(sprite, Texture.WHITE);
  const internals = filter as unknown as {
    glowMask: Filter;
    glowBlur: BlurFilter;
    glowComposite: Filter;
  };
  const placement = { position: [0, 0] as const, scale: [1, 1] as const, opacity: 1 };
  const settings = createShaderSettings();
  const lighting = createSceneLighting(settings, { x: 0, y: 0 }, [], 0, []);
  filter.update(lighting, placement);
  return { sprite, filter, internals, settings, lighting, placement };
}

describe('normal-map highlight glow', () => {
  it('disables glow passes independently of normal illumination and ignores distant lights', () => {
    const { sprite, filter, settings, placement } = setup();
    try {
      const initial = createSceneLighting(settings, { x: 0, y: 0 }, [], 0, []);
      expect(filter.padding).toBeGreaterThan(0);
      for (const key of ['strength', 'radius', 'visualOpacity']) {
        const disabled = withShaderValue(settings, 'normalGlow', key, 0);
        const lighting = createSceneLighting(disabled, { x: 0, y: 0 }, [], 0, []);
        filter.update(lighting, placement);
        expect(filter.padding).toBe(0);
        expect(lighting.lights).toEqual(initial.lights);
        expect(filter.resources.normalUniforms.uniforms.uLightCount).toBe(1);
      }
      settings.effects.normalGlow.enabled = false;
      filter.update(createSceneLighting(settings, { x: 0, y: 0 }, [], 0, []), placement);
      expect(filter.padding).toBe(0);
      settings.effects.normalGlow.enabled = true;
      filter.update(createSceneLighting(settings, { x: 1000, y: 1000 }, [], 0, []), placement);
      expect(filter.padding).toBe(0);
      expect(filter.resources.normalUniforms.uniforms.uLightCount).toBe(0);
    } finally {
      filter.destroy();
      sprite.destroy();
    }
  });

  it('extracts from the original resource and composites with its blend mode, releasing all targets', () => {
    const { sprite, filter, internals } = setup();
    const targets = Array.from({ length: 3 }, () => new Texture({ source: Texture.WHITE.source }));
    const [lit, mask, halo] = targets;
    const acquire = vi.spyOn(TexturePool, 'getSameSizeTexture');
    targets.forEach((target) => acquire.mockReturnValueOnce(target));
    const release = vi.spyOn(TexturePool, 'returnTexture').mockImplementation(() => {});
    const blur = vi.spyOn(internals.glowBlur, 'apply').mockImplementation(() => {});
    const calls: {
      pass: Filter;
      input: Texture;
      output: unknown;
      clear: boolean;
      blend: string;
    }[] = [];
    const manager = {
      calculateSpriteMatrix: vi.fn(() => new Matrix()),
      applyFilter: vi.fn((pass: Filter, input: Texture, output: unknown, clear: boolean) => {
        calls.push({ pass, input, output, clear, blend: pass.blendMode });
      }),
    } as unknown as Parameters<Filter['apply']>[0];
    filter.blendMode = 'screen';
    try {
      filter.apply(manager, Texture.WHITE, Texture.EMPTY, false);
      expect(calls).toEqual([
        { pass: filter, input: Texture.WHITE, output: lit, clear: true, blend: 'normal' },
        {
          pass: internals.glowMask,
          input: Texture.WHITE,
          output: mask,
          clear: true,
          blend: 'normal',
        },
        {
          pass: internals.glowComposite,
          input: lit,
          output: Texture.EMPTY,
          clear: false,
          blend: 'screen',
        },
      ]);
      expect(blur).toHaveBeenCalledWith(manager, mask, halo, true);
      expect(internals.glowMask.resources.normalUniforms).toBe(filter.resources.normalUniforms);
      expect(internals.glowMask.resources.glowOutputUniforms.uniforms.uGlowMask).toBe(1);
      expect(filter.resources.glowOutputUniforms.uniforms.uGlowMask).toBe(0);
      expect(filter.blendMode).toBe('screen');
      expect(release.mock.calls.map(([target]) => target)).toEqual([halo, mask, lit]);
      expect(internals.glowComposite.resources.uGlowTexture).toBe(Texture.EMPTY.source);
    } finally {
      filter.destroy();
      sprite.destroy();
      targets.forEach((target) => target.destroy());
    }
  });

  it('restores blending and returns pooled textures if a GPU pass fails', () => {
    const { sprite, filter } = setup();
    vi.spyOn(TexturePool, 'getSameSizeTexture').mockReturnValue(Texture.EMPTY);
    const release = vi.spyOn(TexturePool, 'returnTexture').mockImplementation(() => {});
    const manager = {
      calculateSpriteMatrix: () => new Matrix(),
      applyFilter: () => {
        throw new Error('GPU pass failed');
      },
    } as unknown as Parameters<Filter['apply']>[0];
    filter.blendMode = 'add';
    try {
      expect(() => filter.apply(manager, Texture.WHITE, Texture.EMPTY, false)).toThrow(
        'GPU pass failed',
      );
      expect(filter.blendMode).toBe('add');
      expect(release).toHaveBeenCalledTimes(3);
    } finally {
      filter.destroy();
      sprite.destroy();
    }
  });
});
