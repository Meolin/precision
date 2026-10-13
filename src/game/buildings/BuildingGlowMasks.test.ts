import {
  BufferImageSource,
  Container,
  Sprite,
  Texture,
  type Renderer,
  type RenderOptions,
} from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultBuildingAnimationConfig } from './BuildingAnimationConfig';
import { createAnimationEffectStage } from './BuildingAnimationEffects';
import { BuildingGlowMasks } from './BuildingGlowMasks';

function fixture() {
  const config = createDefaultBuildingAnimationConfig();
  const source = config.stages[0]!;
  Object.assign(source, { inPoint: 0, outPoint: 1, opacity: 0.4 });
  config.stages = [source];
  const glow = createAnimationEffectStage(config, 'glow', 'filter', 'glow', source.id);
  Object.assign(glow, {
    fxStrength: 2,
    opacity: 0.5,
    fxRadius: 10,
    fxRed: 0,
    fxGreen: 255,
    fxBlue: 0,
    fxVisualOpacity: 0,
  });
  config.stages.push(glow);
  // Two detached opaque islands with a transparent gap: the exact texture must
  // reach the GPU capture, rather than being replaced with a center/radius.
  const pixels = new Uint8Array(100 * 100 * 4);
  for (const x of [10, 80]) for (let y = 20; y < 80; y++) pixels[(y * 100 + x) * 4 + 3] = 255;
  const texture = new Texture({
    source: new BufferImageSource({ resource: pixels, width: 100, height: 100 }),
  });
  const sprite = new Sprite(texture);
  sprite.scale.set(2, 1);
  sprite.alpha = source.opacity;
  const render = vi.fn<(options: RenderOptions) => void>();
  const renderer = { render } as unknown as Renderer;
  const masks = new BuildingGlowMasks();
  const placement = { position: [100, 200] as const, scale: [0.1, 0.2] as const, opacity: 0.5 };
  return { config, source, glow, texture, sprite, renderer, render, masks, placement };
}

describe('contour Glow alpha captures', () => {
  it('captures the original alpha islands and preserves affine world mapping and visual independence', () => {
    const f = fixture();
    try {
      const result = f.masks.collect(f.renderer, f.config, 0.5, f.placement, () => f.sprite);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ strength: 2, opacity: 0.25, color: 0x00ff00 });
      [0.05, 0, 0, 0.05, -5, -10].forEach((value, i) =>
        expect(result[0]?.worldToMask[i]).toBeCloseTo(value),
      );
      expect(result[0]?.haloBasis).toEqual([1, 0, 0, 2]);
      const options = f.render.mock.calls[0]![0];
      const copy = options.container as Sprite;
      expect(copy).not.toBe(f.sprite);
      expect(copy.texture).toBe(f.texture);
      expect(copy.alpha).toBe(0.4);
      expect(f.sprite.scale.x).toBe(2);
      expect(f.sprite.alpha).toBe(0.4);
      f.glow.fxVisualOpacity = 1;
      const again = f.masks.collect(f.renderer, f.config, 0.5, f.placement, () => f.sprite);
      expect(again).toEqual(result);
      expect(again[0]?.mask).toBe(result[0]?.mask);
      f.glow.hidden = true;
      expect(f.masks.collect(f.renderer, f.config, 0.5, f.placement, () => f.sprite)).toEqual([]);
      expect(result[0]?.mask.destroyed).toBe(true);
    } finally {
      f.masks.destroy();
      f.sprite.destroy();
      f.texture.destroy(true);
    }
  });

  it('captures live particle/atlas geometry even when the parent visual overlay is hidden', () => {
    const f = fixture();
    const particles = createAnimationEffectStage(f.config, 'particles', 'particles', 'sparks');
    particles.opacity = 0.6;
    particles.fxVisualOpacity = 0;
    f.glow.parentId = particles.id;
    f.config.stages = [particles, f.glow];
    const resource = new Container();
    resource.alpha = 0;
    const particle = new Sprite(f.texture);
    particle.position.set(30, 40);
    particle.alpha = 0.3;
    resource.addChild(particle);
    try {
      const result = f.masks.collect(f.renderer, f.config, 0.5, f.placement, () => resource);
      expect(result).toHaveLength(1);
      const options = f.render.mock.calls[0]![0];
      expect(options.container.alpha).toBe(0.6);
      expect(options.container.children[0]?.alpha).toBe(0.3);
      expect((options.container.children[0] as Sprite).texture).toBe(f.texture);
      expect(resource.alpha).toBe(0);
      expect(particle.position.x).toBe(30);
      expect(particle.position.y).toBe(40);
    } finally {
      f.masks.destroy();
      resource.destroy({ children: true });
      f.sprite.destroy();
      f.texture.destroy(true);
    }
  });
});
