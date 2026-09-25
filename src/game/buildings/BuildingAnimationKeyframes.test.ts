import { describe, expect, it } from 'vitest';
import {
  createDefaultBuildingAnimationConfig,
  loadBuildingAnimationConfig,
  validateBuildingAnimationConfig,
  type BuildingAnimationTrack,
} from './BuildingAnimationConfig';
import { sampleBuildingTrack } from './BuildingAnimationKeyframes';

const track: BuildingAnimationTrack = {
  stageId: 'stage-1',
  property: 'x',
  keys: [
    { id: 'start', time: 0, value: 0, interpolation: 'linear', bezier: [0.4, 0, 0.2, 1] },
    { id: 'end', time: 1, value: 100, interpolation: 'linear', bezier: [0.4, 0, 0.2, 1] },
  ],
};

describe('building animation keyframes', () => {
  it('samples the selected stage track and falls back to its base transform', () => {
    expect(sampleBuildingTrack(track, 0.25, 10)).toBe(25);
    expect(sampleBuildingTrack(undefined, 0.25, 10)).toBe(10);
  });

  it('switches to the next key exactly at a step boundary', () => {
    const stepped = structuredClone(track);
    stepped.keys[0]!.interpolation = 'step';
    stepped.keys[1]!.time = 0.5;
    expect(sampleBuildingTrack(stepped, 0.499, 10)).toBe(0);
    expect(sampleBuildingTrack(stepped, 0.5, 10)).toBe(100);
  });

  it('uses a quadratic curve for ease interpolation and custom Bézier control points', () => {
    const eased = structuredClone(track);
    eased.keys[0]!.interpolation = 'ease-in';
    expect(sampleBuildingTrack(eased, 0.5, 0)).toBe(25);
    eased.keys[0]!.interpolation = 'ease-out';
    expect(sampleBuildingTrack(eased, 0.5, 0)).toBe(75);
    eased.keys[0]!.interpolation = 'cubic-bezier';
    eased.keys[0]!.bezier = [0.5, 0, 0.5, 1];
    expect(sampleBuildingTrack(eased, 0.5, 0)).toBeCloseTo(50);
  });

  it('migrates v2 configurations and rejects invalid key values', () => {
    const oldConfig = createDefaultBuildingAnimationConfig();
    const migrated = loadBuildingAnimationConfig({
      ...oldConfig,
      schemaVersion: 2,
      tracks: undefined,
    });
    expect(migrated.schemaVersion).toBe(5);
    expect(migrated.tracks).toEqual([]);
    expect(migrated.timeline.durationSeconds).toBe(4);

    const v3 = loadBuildingAnimationConfig({ ...oldConfig, schemaVersion: 3, timeline: undefined });
    expect(v3.schemaVersion).toBe(5);
    expect(v3.stages[0]?.opacity).toBe(1);

    const v4 = loadBuildingAnimationConfig({ ...oldConfig, schemaVersion: 4 });
    expect(v4.stages[0]?.inPoint).toBe(0);
    expect(v4.stages[0]?.outPoint).toBe(v4.stages[1]?.milestone);
    expect(v4.stages.at(-1)?.layerOrder).toBe(0);

    const config = createDefaultBuildingAnimationConfig();
    config.tracks = [{ ...structuredClone(track), property: 'opacity' }];
    config.tracks[0]!.keys[1]!.value = 1.5;
    expect(validateBuildingAnimationConfig(config).valid).toBe(false);
  });

  it('rejects unsupported transition modes instead of exporting an unusable animation', () => {
    for (const property of ['type', 'direction', 'easing'] as const) {
      const config = createDefaultBuildingAnimationConfig();
      Object.assign(config.transitions[0]!, { [property]: 'unsupported' });
      expect(validateBuildingAnimationConfig(config).valid).toBe(false);
      expect(() => loadBuildingAnimationConfig(config)).toThrow();
    }
  });

  it('reports malformed stages without throwing during transition validation', () => {
    const config = createDefaultBuildingAnimationConfig();
    config.stages[1] = null as unknown as (typeof config.stages)[number];
    expect(validateBuildingAnimationConfig(config).valid).toBe(false);
  });
});
