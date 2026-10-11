import { describe, expect, it } from 'vitest';
import {
  createDefaultBuildingAnimationConfig,
  loadBuildingAnimationConfig,
  validateBuildingAnimationConfig,
} from './BuildingAnimationConfig';
import {
  animationLayerEntries,
  createAnimationEffectStage,
  normalizeAnimationLayers,
  removeAnimationLayers,
  reorderAnimationLayer,
} from './BuildingAnimationEffects';
import { sampleAnimationParticles } from './BuildingAnimationParticles';
import {
  editAnimationValue,
  sampleAnimationStage,
} from '../../ui/AnimationSandbox/AnimationEditing';

function composition() {
  const config = createDefaultBuildingAnimationConfig();
  const emitter = createAnimationEffectStage(config, 'emitter', 'particles', 'sparks');
  const glow = createAnimationEffectStage(config, 'glow', 'filter', 'glow', config.stages[0]!.id);
  config.stages.push(emitter, glow);
  normalizeAnimationLayers(config);
  return { config, emitter, glow };
}

describe('animation procedural media', () => {
  it('round-trips resources, dependencies and parameter keys without external assets', () => {
    const { config, emitter } = composition();
    editAnimationValue(config, emitter.id, 'fxRate', 0, 0, false, true, () => 'rate-start');
    editAnimationValue(config, emitter.id, 'fxRate', 120, 1, false, true, () => 'rate-end');
    const loaded = loadBuildingAnimationConfig(JSON.parse(JSON.stringify(config)));
    expect(loaded).toEqual(config);
    expect(sampleAnimationStage(loaded, emitter.id, 0.5)?.fxRate).toBe(60);
    expect(loaded.stages.at(-1)?.parentId).toBe(config.stages[0]!.id);
  });

  it('keeps filters underneath their resource when moving a resource', () => {
    const { config, glow, emitter } = composition();
    const parentId = glow.parentId!;
    reorderAnimationLayer(config, parentId, emitter.id);
    const entries = animationLayerEntries(config).map(({ stage }) => stage.id);
    expect(entries[entries.indexOf(parentId) + 1]).toBe(glow.id);
    const before = structuredClone(config);
    reorderAnimationLayer(config, glow.id, emitter.id);
    expect(config).toEqual(before);
    expect(validateBuildingAnimationConfig(config).valid).toBe(true);
  });

  it('rejects missing parents, filter chains, incompatible tracks and invalid emission parameters', () => {
    const { config, glow, emitter } = composition();
    glow.parentId = 'missing';
    expect(validateBuildingAnimationConfig(config).valid).toBe(false);
    glow.parentId = glow.id;
    expect(validateBuildingAnimationConfig(config).valid).toBe(false);
    glow.parentId = emitter.id;
    emitter.fxLifetime = 100;
    expect(validateBuildingAnimationConfig(config).valid).toBe(false);
    emitter.fxLifetime = 1;
    editAnimationValue(config, emitter.id, 'fxRate', 10, 0, false, true, () => 'rate');
    config.tracks[0]!.stageId = config.stages[0]!.id;
    expect(validateBuildingAnimationConfig(config).valid).toBe(false);
  });

  it('removes dependent effects and their tracks along with a generator', () => {
    const { config, emitter, glow } = composition();
    glow.parentId = emitter.id;
    editAnimationValue(config, glow.id, 'fxStrength', 2, 0.5, false, true, () => 'strength');
    removeAnimationLayers(config, [emitter.id]);
    expect(config.stages.some((stage) => stage.id === glow.id)).toBe(false);
    expect(config.tracks).toEqual([]);
    expect(validateBuildingAnimationConfig(config).valid).toBe(true);
  });

  it('reconstructs seeded particles on arbitrary seeks without mutating the composition', () => {
    const { config, emitter } = composition();
    emitter.fxRate = 120;
    const before = structuredClone(config);
    const frame = sampleAnimationParticles(config, emitter, 0.5);
    expect(frame.length).toBeGreaterThan(0);
    sampleAnimationParticles(config, emitter, 0.9);
    sampleAnimationParticles(config, emitter, 0.1);
    expect(sampleAnimationParticles(config, emitter, 0.5)).toEqual(frame);
    expect(config).toEqual(before);
    expect(sampleAnimationParticles(config, { ...emitter, seed: 2 }, 0.5)).not.toEqual(frame);
  });

  it('respects clip boundaries, animated emission and the particle budget', () => {
    const { config, emitter } = composition();
    emitter.endBehavior = 'cut';
    emitter.inPoint = 0.2;
    emitter.outPoint = 0.8;
    emitter.fxRate = 0;
    expect(sampleAnimationParticles(config, emitter, 0.5)).toEqual([]);
    editAnimationValue(config, emitter.id, 'fxRate', 120, 0, false, true, () => 'rate');
    expect(sampleAnimationParticles(config, emitter, 0.5).length).toBeGreaterThan(0);
    expect(sampleAnimationParticles(config, emitter, 0.1)).toEqual([]);
    expect(sampleAnimationParticles(config, emitter, 0.8)).toEqual([]);
    emitter.fxLifetime = 10;
    config.timeline.durationSeconds = 60;
    expect(sampleAnimationParticles(config, emitter, 0.5)).toHaveLength(600);
  });

  it('imports v7 images and preserves their transition parameters', () => {
    const config = createDefaultBuildingAnimationConfig();
    const migrated = loadBuildingAnimationConfig({ ...config, schemaVersion: 7 });
    expect(migrated.schemaVersion).toBe(9);
    expect(migrated.stages).toEqual(config.stages);
    expect(migrated.transitions).toEqual(config.transitions);
  });
});
