import { describe, expect, it, vi } from 'vitest';
import { Sprite, Texture } from 'pixi.js';
import { createDefaultBuildingAnimationConfig } from './BuildingAnimationConfig';
import { BuildingAnimationPlayer } from './BuildingAnimationPlayer';
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
