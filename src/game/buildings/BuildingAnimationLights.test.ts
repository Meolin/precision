import { describe, expect, it } from 'vitest';
import { createDefaultBuildingAnimationConfig } from './BuildingAnimationConfig';
import { createAnimationEffectStage } from './BuildingAnimationEffects';
import { sampleBuildingAnimationLights } from './BuildingAnimationLights';

function setup() {
  const config = createDefaultBuildingAnimationConfig();
  const aura = createAnimationEffectStage(config, 'aura', 'light');
  Object.assign(aura, {
    x: config.origin.x + 10,
    y: config.origin.y - 20,
    pivotX: 5,
    pivotY: 0,
    scaleX: 2,
    scaleY: 1,
    rotation: 0,
    skewX: 0,
    skewY: 0,
    opacity: 0.5,
    fxStrength: 4,
    fxRadius: 20,
    fxRed: 255,
    fxGreen: 128,
    fxBlue: 0,
  });
  config.stages = [aura];
  config.tracks = [
    {
      stageId: aura.id,
      property: 'fxStrength',
      keys: [
        { id: 'start', time: 0, value: 0, interpolation: 'linear', bezier: [0.4, 0, 0.2, 1] },
        { id: 'end', time: 1, value: 4, interpolation: 'linear', bezier: [0.4, 0, 0.2, 1] },
      ],
    },
  ];
  const placement = { position: [30, 40] as const, scale: [0.1, 0.2] as const, opacity: 0.5 };
  return { config, aura, placement };
}

describe('animation world lights', () => {
  it('keeps Aura separate from dependent Glow mask sources', () => {
    const { config, aura, placement } = setup();
    const glow = createAnimationEffectStage(config, 'glow', 'filter', 'glow', aura.id);
    Object.assign(glow, { fxStrength: 2, opacity: 0.5, fxRadius: 10 });
    config.stages.push(glow);
    const before = sampleBuildingAnimationLights(config, 0.5, placement);
    expect(before).toHaveLength(1);
    for (const visualOpacity of [0.5, 0.1, 0]) {
      glow.fxVisualOpacity = visualOpacity;
      aura.fxVisualOpacity = visualOpacity;
      expect(sampleBuildingAnimationLights(config, 0.5, placement)).toEqual(before);
    }
    glow.hidden = true;
    expect(sampleBuildingAnimationLights(config, 0.5, placement)).toEqual([before[0]]);
    glow.hidden = false;
    glow.enabled = false;
    expect(sampleBuildingAnimationLights(config, 0.5, placement)).toEqual([before[0]]);
    glow.enabled = true;
    aura.hidden = true;
    expect(sampleBuildingAnimationLights(config, 0.5, placement)).toEqual([]);
  });

  it('does not create a circular point source for image Glow', () => {
    const config = createDefaultBuildingAnimationConfig();
    const source = config.stages[0]!;
    Object.assign(source, {
      x: 0,
      y: 0,
      scaleX: 2,
      scaleY: 1,
      rotation: 0,
      skewX: 0,
      skewY: 0,
      pivotX: 0,
      pivotY: 0,
      opacity: 0.4,
      milestone: 0,
      inPoint: 0,
      outPoint: 1,
    });
    config.origin = { x: 0, y: 0 };
    config.alphaBounds = { x: 10, y: 20, width: 40, height: 60 };
    config.stages = [source];
    config.transitions = [];
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
    const placement = { position: [100, 200] as const, scale: [0.1, 0.2] as const, opacity: 0.5 };
    expect(sampleBuildingAnimationLights(config, 0.5, placement)).toEqual([]);
    source.opacity = 0;
    expect(sampleBuildingAnimationLights(config, 0.5, placement)).toEqual([]);
    source.opacity = 0.4;
    source.outPoint = 0.5;
    expect(sampleBuildingAnimationLights(config, 0.5, placement)).toEqual([]);
  });

  it('samples RGB, strength, opacity, pivot and world scale and is stable when seeking', () => {
    const { config, placement } = setup();
    const before = structuredClone(config);
    expect(sampleBuildingAnimationLights(config, 0.5, placement)).toEqual([
      { position: [30, 36], radius: 4, intensity: 0.5, color: 0xff8000 },
    ]);
    sampleBuildingAnimationLights(config, 1, placement);
    expect(sampleBuildingAnimationLights(config, 0.5, placement)[0]?.intensity).toBe(0.5);
    expect(config).toEqual(before);
  });

  it('removes lights outside their clip, when hidden or disabled, and under another solo layer', () => {
    const { config, aura, placement } = setup();
    aura.outPoint = 0.5;
    expect(sampleBuildingAnimationLights(config, 0.5, placement)).toEqual([]);
    aura.outPoint = 1;
    aura.hidden = true;
    expect(sampleBuildingAnimationLights(config, 0.25, placement)).toEqual([]);
    aura.hidden = false;
    aura.enabled = false;
    expect(sampleBuildingAnimationLights(config, 0.25, placement)).toEqual([]);
    aura.enabled = true;
    config.stages.push({ ...aura, id: 'solo', solo: true, fxRadius: 0 });
    expect(sampleBuildingAnimationLights(config, 0.25, placement)).toEqual([]);
    config.stages.pop();
    expect(sampleBuildingAnimationLights(config, 0.25, { ...placement, opacity: 0 })).toEqual([]);
  });
});
