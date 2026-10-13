import { describe, expect, it, vi } from 'vitest';
import { Sprite, Texture, type Renderer } from 'pixi.js';
import { createDefaultBuildingAnimationConfig } from './BuildingAnimationConfig';
import { BuildingAnimationPlayer } from './BuildingAnimationPlayer';
import { BuildingNormalMapFilter } from './BuildingNormalMapFilter';
import type { TerrainLightingSettings } from '../rendering/TerrainLightingSettings';
import { buildingTransitionCatalog } from './BuildingAnimationTransitions';
import { createAnimationEffectStage, normalizeAnimationLayers } from './BuildingAnimationEffects';

// Node has no WebGL context. Keep real Pixi containers, matrices, sprites and uniforms;
// shader compilation itself is checked in the local browser.
vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  return { ...pixi, GlProgram: { from: () => ({ destroy: vi.fn() }) } };
});

async function setup() {
  const config = createDefaultBuildingAnimationConfig();
  config.stages = config.stages.slice(0, 2);
  config.stages[0]!.outPoint = 0.8;
  config.stages[1]!.milestone = 0.8;
  config.stages[1]!.outPoint = 1;
  config.transitions = config.transitions.slice(0, 1);
  const player = new BuildingAnimationPlayer({ config, resolveTexture: () => Texture.EMPTY });
  // setConfig waits for a complete texture load, so assertions never race its constructor.
  await player.setConfig(config, () => Texture.EMPTY, true);
  const sprites = player.container.children.filter(
    (child): child is Sprite => child instanceof Sprite,
  );
  // Two stage sprites followed by the onion-skin sprite.
  return { config, player, outgoing: sprites[0]!, incoming: sprites[1]! };
}

describe('production transition player', () => {
  it('loads and lights attached normals before transitions, then releases their filters on removal', async () => {
    const { config, player } = await setup();
    config.stages[0]!.normalMapAssetId = 'normal.png';
    config.transitions[0]!.type = 'dissolve';
    const resolve = vi.fn(() => Texture.EMPTY);
    const lighting: TerrainLightingSettings = {
      enabled: true,
      normalStrength: 1,
      ambient: 0.4,
      blendMode: 'multiply',
      display: 'final',
      lights: [{ position: [10, 10], radius: 10000, intensity: 2, color: 0xffffff }],
      glows: [],
    };
    const placement = { position: [0, 0] as const, scale: [1, 1] as const, opacity: 1 };
    try {
      await player.setConfig(config, resolve);
      expect(resolve).toHaveBeenCalledWith('normal.png');
      player.setProgress(0.4);
      player.setLighting(lighting, placement);
      const sprite = player.container.children.find(
        (child) => child instanceof Sprite && child.filters?.[0] instanceof BuildingNormalMapFilter,
      ) as Sprite;
      expect(sprite).toBeDefined();
      const filter = sprite.filters![0] as BuildingNormalMapFilter;
      expect(sprite.filters).toHaveLength(2);
      expect(filter.resources.normalUniforms.uniforms.uLightCount).toBe(1);
      player.setLighting(lighting, placement);
      expect(sprite.filters!.filter((item) => item === filter)).toHaveLength(1);
      player.setLighting({ ...lighting, enabled: false }, placement);
      expect(sprite.filters?.includes(filter) ?? false).toBe(false);
      const destroy = vi.spyOn(filter, 'destroy');
      delete config.stages[0]!.normalMapAssetId;
      await player.setConfig(config, resolve);
      expect(destroy).toHaveBeenCalledOnce();
      player.setLighting(lighting, placement);
      expect(
        player.container.children.some((child) =>
          child.filters?.some((item) => item instanceof BuildingNormalMapFilter),
        ),
      ).toBe(false);
    } finally {
      player.destroy();
    }
  });
  it('animates aura overlay opacity independently from normal-map illumination', async () => {
    const config = createDefaultBuildingAnimationConfig();
    const aura = createAnimationEffectStage(config, 'aura', 'light');
    Object.assign(aura, { fxStrength: 2, opacity: 1, fxRadius: 10, inPoint: 0, outPoint: 1 });
    config.stages = [aura];
    config.transitions = [];
    config.tracks = [
      {
        stageId: aura.id,
        property: 'fxVisualOpacity',
        keys: [
          { id: 'start', time: 0, value: 1, interpolation: 'linear', bezier: [0.4, 0, 0.2, 1] },
          { id: 'end', time: 1, value: 0, interpolation: 'linear', bezier: [0.4, 0, 0.2, 1] },
        ],
      },
    ];
    const player = new BuildingAnimationPlayer({ config });
    const placement = { position: [0, 0] as const, scale: [1, 1] as const, opacity: 1 };
    try {
      await player.setConfig(config);
      player.setProgress(0.5);
      const resource = player.container.children[0]!;
      expect(resource.alpha).toBeCloseTo(0.5);
      expect(player.getLightSources(placement)[0]?.intensity).toBe(2);
      player.setProgress(1);
      expect(resource.alpha).toBe(0);
      expect(player.getLightSources(placement)[0]?.intensity).toBe(2);
      config.tracks = [];
      delete aura.fxVisualOpacity;
      await player.setConfig(config);
      expect(resource.alpha).toBe(1);
    } finally {
      player.destroy();
    }
  });

  it('hides the glow overlay while retaining the underlying resource', async () => {
    const config = createDefaultBuildingAnimationConfig();
    const emitter = createAnimationEffectStage(config, 'emitter', 'particles', 'sparks');
    emitter.opacity = 0.35;
    emitter.blendMode = 'add';
    config.stages = [emitter];
    const glow = createAnimationEffectStage(config, 'glow', 'filter', 'glow', emitter.id);
    glow.opacity = 0.8;
    config.stages.push(glow);
    config.transitions = [];
    const player = new BuildingAnimationPlayer({ config });
    const placement = { position: [0, 0] as const, scale: [1, 1] as const, opacity: 1 };
    const renderer = { render: vi.fn() } as unknown as Renderer;
    try {
      await player.setConfig(config);
      player.setProgress(0.5);
      const resource = player.container.children[0]!;
      expect(resource.filters).toHaveLength(1);
      expect(resource.filters![0]!.blendMode).toBe('add');
      const lights = player.getGlowSources(renderer, placement);
      expect(lights).toHaveLength(1);
      expect(lights[0]?.strength).toBe(1);
      expect(lights[0]?.opacity).toBe(0.8);
      expect(player.getLightSources(placement)).toEqual([]);
      glow.fxVisualOpacity = 0;
      await player.setConfig(config);
      expect(resource.filters).toBeNull();
      expect(resource.visible).toBe(true);
      expect(resource.alpha).toBe(0.35);
      expect(player.getGlowSources(renderer, placement)).toEqual(lights);
      glow.fxVisualOpacity = 0.25;
      await player.setConfig(config);
      expect(resource.filters).toHaveLength(1);
      expect(resource.alpha).toBe(0.35);
      expect(resource.blendMode).toBe('add');
      const filter = resource.filters![0]!;
      expect(filter.blendMode).toBe('add');
      expect(filter.resources.effectUniforms.uniforms).toMatchObject({
        uMix: 0.8,
        uVisualOpacity: 0.25,
      });
      expect(player.getGlowSources(renderer, placement)).toEqual(lights);
    } finally {
      player.destroy();
    }
  });

  it('preserves resource blending only on the final pass of a glow filter chain', async () => {
    const config = createDefaultBuildingAnimationConfig();
    const aura = createAnimationEffectStage(config, 'aura', 'light');
    aura.blendMode = 'screen';
    aura.opacity = 0.4;
    config.stages = [aura];
    const glow = createAnimationEffectStage(config, 'glow', 'filter', 'glow', aura.id);
    glow.fxVisualOpacity = 0.5;
    config.stages.push(glow);
    const blur = createAnimationEffectStage(config, 'blur', 'filter', 'blur', aura.id);
    config.stages.push(blur);
    config.transitions = [];
    const player = new BuildingAnimationPlayer({ config });
    try {
      await player.setConfig(config);
      player.setProgress(0.5);
      const resource = player.container.children[0]!;
      expect(resource.filters?.map((filter) => filter.blendMode)).toEqual(['normal', 'screen']);
      expect(resource.alpha).toBe(0.4);
      glow.fxVisualOpacity = 0;
      await player.setConfig(config);
      expect(resource.filters?.map((filter) => filter.blendMode)).toEqual(['screen']);
      expect(resource.alpha).toBe(0.4);
      aura.blendMode = 'normal';
      await player.setConfig(config);
      expect(resource.filters?.map((filter) => filter.blendMode)).toEqual(['normal']);
    } finally {
      player.destroy();
    }
  });

  it('exposes the current aura light after seeking and editing its configuration', async () => {
    const config = createDefaultBuildingAnimationConfig();
    const aura = createAnimationEffectStage(config, 'aura', 'light');
    Object.assign(aura, { fxStrength: 2, opacity: 0.5, fxRadius: 10, inPoint: 0, outPoint: 0.8 });
    config.stages = [aura];
    config.transitions = [];
    const player = new BuildingAnimationPlayer({ config });
    const placement = { position: [0, 0] as const, scale: [1, 1] as const, opacity: 1 };
    try {
      await player.setConfig(config);
      player.setProgress(0.4);
      expect(player.getLightSources(placement)[0]).toMatchObject({ radius: 10, intensity: 1 });
      player.setProgress(0.9);
      expect(player.getLightSources(placement)).toEqual([]);
      player.setProgress(0.4);
      expect(player.getLightSources(placement)).toHaveLength(1);
      aura.hidden = true;
      await player.setConfig(config);
      expect(player.getLightSources(placement)).toEqual([]);
    } finally {
      player.destroy();
    }
    expect(player.getLightSources(placement)).toEqual([]);
  });

  it('plays generators and dependent filters without requesting procedural textures', async () => {
    const config = createDefaultBuildingAnimationConfig();
    const emitter = createAnimationEffectStage(config, 'emitter', 'particles', 'sparks');
    config.stages.push(emitter);
    const glow = createAnimationEffectStage(config, 'glow', 'filter', 'glow', emitter.id);
    config.stages = [emitter, glow];
    config.transitions = [];
    normalizeAnimationLayers(config);
    const resolver = vi.fn(() => Texture.EMPTY);
    const player = new BuildingAnimationPlayer({ config, resolveTexture: resolver });
    try {
      await player.setConfig(config, resolver, true);
      player.setProgress(0.5);
      expect(resolver).not.toHaveBeenCalled();
      const resource = player.container.children[0]!;
      expect(resource.filters).toHaveLength(1);
      const filter = resource.filters![0];
      glow.enabled = false;
      await player.setConfig(config);
      expect(resource.filters).toBeNull();
      glow.enabled = true;
      await player.setConfig(config);
      expect(resource.filters?.[0]).toBe(filter);
      emitter.outPoint = 0.4;
      emitter.endBehavior = 'cut';
      await player.setConfig(config);
      expect(resource.visible).toBe(false);
      expect(resource.filters).toBeNull();
      player.setProgress(0.2);
      expect(resource.visible).toBe(true);
      expect(resource.filters).toHaveLength(1);
    } finally {
      player.destroy();
    }
  });

  it('keeps particle tails after the emission clip and removes them after their lifetime', async () => {
    const config = createDefaultBuildingAnimationConfig();
    const emitter = createAnimationEffectStage(config, 'emitter', 'particles', 'sparks');
    emitter.outPoint = 0.4;
    emitter.endBehavior = 'tail';
    config.stages = [emitter];
    config.transitions = [];
    const player = new BuildingAnimationPlayer({ config, resolveTexture: () => Texture.EMPTY });
    try {
      await player.setConfig(config, () => Texture.EMPTY, true);
      player.setProgress(0.5);
      expect(player.container.children[0]!.visible).toBe(true);
      player.setProgress(1);
      expect(player.container.children[0]!.visible).toBe(false);
    } finally {
      player.destroy();
    }
  });

  it('resets every effect when seeking to the completed stage and back to the same frame', async () => {
    const { config, player, outgoing, incoming } = await setup();
    try {
      for (const effect of buildingTransitionCatalog) {
        config.transitions[0]!.type = effect.id;
        await player.setConfig(config);
        player.setProgress(0.4);
        const pose = [
          incoming.x,
          incoming.y,
          incoming.scale.x,
          incoming.scale.y,
          incoming.rotation,
          incoming.alpha,
        ];
        player.setProgress(1);
        expect(incoming.alpha).toBe(1);
        expect(incoming.filters).toBeNull();
        expect(incoming.mask).toBeFalsy();
        expect(incoming.scale.x).toBe(1);
        expect(incoming.scale.y).toBe(1);
        expect(incoming.rotation).toBe(0);
        expect(incoming.x).toBe(-config.origin.x);
        expect(outgoing.visible).toBe(false);
        player.setProgress(0.4);
        expect([
          incoming.x,
          incoming.y,
          incoming.scale.x,
          incoming.scale.y,
          incoming.rotation,
          incoming.alpha,
        ]).toEqual(pose);
      }
    } finally {
      player.destroy();
    }
  });

  it('keeps separate uniforms for outgoing/incoming masks and preserves keyed opacity', async () => {
    const { config, player, outgoing, incoming } = await setup();
    try {
      config.stages[1]!.opacity = 0.6;
      config.transitions[0]!.type = 'iris-circle';
      config.transitions[0]!.easing = 'linear';
      config.transitions[0]!.centerX = 0.2;
      config.transitions[0]!.noiseScale = -8;
      config.transitions[0]!.directionStrength = 2;
      await player.setConfig(config);
      player.setProgress(0.4);
      expect(incoming.alpha).toBe(0.6);
      expect(incoming.filters?.[0]).not.toBe(outgoing.filters?.[0]);
      const next = incoming.filters![0]!.resources.transitionUniforms.uniforms;
      const previous = outgoing.filters![0]!.resources.transitionUniforms.uniforms;
      expect(next.uIncoming).toBe(1);
      expect(previous.uIncoming).toBe(0);
      expect(next.uProgress).toBe(0.5);
      expect(next.uNoiseScale).toBe(1);
      expect(next.uDirectionStrength).toBe(1);
      expect(Array.from(next.uCenter)).toEqual([expect.closeTo(0.2), 0.5]);
      config.transitions[0]!.type = 'crossfade';
      await player.setConfig(config);
      player.setProgress(0.4);
      expect(incoming.alpha).toBeCloseTo(0.3);
      expect(outgoing.alpha).toBe(0.5);
      expect(incoming.filters).toBeNull();
      expect(previous.uIncoming).toBe(0);
    } finally {
      player.destroy();
    }
  });

  it('composes a zoom around the chosen point without changing its authored position or config', async () => {
    const { config, player, incoming } = await setup();
    try {
      config.transitions[0]!.type = 'zoom-in';
      config.transitions[0]!.easing = 'linear';
      config.transitions[0]!.strength = 0.5;
      config.stages[1]!.x = 50;
      config.stages[1]!.scaleX = 2;
      config.stages[1]!.rotation = 20;
      await player.setConfig(config);
      const before = structuredClone(config);
      player.setProgress(1);
      incoming.updateLocalTransform();
      const point = { x: config.canvas.width / 2, y: config.canvas.height / 2 };
      const center = incoming.localTransform.apply(point);
      player.setProgress(0.4);
      incoming.updateLocalTransform();
      const animatedCenter = incoming.localTransform.apply(point);
      expect(animatedCenter.x).toBeCloseTo(center.x);
      expect(animatedCenter.y).toBeCloseTo(center.y);
      expect(incoming.scale.x).toBeCloseTo(1.5);
      expect(config).toEqual(before);
    } finally {
      player.destroy();
    }
  });
});
