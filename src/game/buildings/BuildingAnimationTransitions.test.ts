import { describe, expect, it } from 'vitest';
import {
  createDefaultBuildingAnimationConfig,
  loadBuildingAnimationConfig,
  validateBuildingAnimationConfig,
} from './BuildingAnimationConfig';
import {
  buildingTransitionCatalog,
  buildingTransitionDirections,
  createDefaultBuildingTransition,
  easeTransition,
  sampleBuildingTransition,
  transitionParameterDefaults,
  transitionVector,
} from './BuildingAnimationTransitions';
import {
  createBuildingAnimationLibrary,
  loadBuildingAnimationLibrary,
} from './BuildingAnimationLibrary';

describe('stage transition catalog', () => {
  it('round-trips every effect with all directions through JSON validation', () => {
    expect(buildingTransitionCatalog).toHaveLength(40);
    expect(new Set(buildingTransitionCatalog.map((entry) => entry.id)).size).toBe(40);
    for (const effect of buildingTransitionCatalog) {
      for (const direction of buildingTransitionDirections) {
        const config = createDefaultBuildingAnimationConfig();
        Object.assign(config.transitions[0]!, {
          type: effect.id,
          direction: direction.id,
          seed: 123,
          reverse: true,
          centerX: 0,
          centerY: 1,
          angle: -135,
        });
        expect(loadBuildingAnimationConfig(JSON.parse(JSON.stringify(config)))).toEqual(config);
      }
    }
  });

  it('migrates v6 transitions and preserves markers, sound and independent animation tabs', () => {
    const library = createBuildingAnimationLibrary();
    const config = library.animations[0]!.config;
    config.markers.push({ id: 'cue', name: 'Cue', time: 0.3 });
    config.sounds.push({
      id: 'cue-sound',
      name: 'Cue',
      assetId: 'audio/cue.wav',
      sourceDuration: 2,
      startSeconds: 0.3,
      offsetSeconds: 0,
      durationSeconds: 1,
      volume: 0.6,
      muted: false,
      solo: false,
      fadeInSeconds: 0.1,
      fadeOutSeconds: 0.2,
      waveform: [0.2, 0.7],
    });
    config.transitions[0]!.type = 'reveal';
    const legacy = JSON.parse(JSON.stringify(library));
    for (const entry of legacy.animations) {
      entry.config.schemaVersion = 6;
      for (const transition of entry.config.transitions)
        for (const key of Object.keys(transitionParameterDefaults)) delete transition[key];
    }
    const migrated = loadBuildingAnimationLibrary(legacy);
    expect(migrated.animations[0]!.config.schemaVersion).toBe(9);
    expect(migrated.animations[0]!.config.markers).toEqual(config.markers);
    expect(migrated.animations[0]!.config.sounds).toEqual(config.sounds);
    expect(migrated.animations[0]!.config.transitions[0]!).toMatchObject({
      type: 'reveal',
      direction: 'left-to-right',
      ...transitionParameterDefaults,
    });
    expect(migrated.animations[1]!.config.transitions).toEqual([]);
    expect(loadBuildingAnimationLibrary(migrated)).toEqual(migrated);
    expect(legacy.animations[0].config.schemaVersion).toBe(6);
  });

  it('rejects invalid effect parameters rather than silently changing v7 documents', () => {
    for (const patch of [
      { softness: NaN },
      { softness: -1 },
      { strength: 3 },
      { segments: 1 },
      { segments: 12.5 },
      { angle: 361 },
      { centerX: -0.1 },
      { centerY: 1.1 },
      { seed: 65536 },
      { seed: 0.5 },
      { reverse: undefined },
    ]) {
      const config = createDefaultBuildingAnimationConfig();
      Object.assign(config.transitions[0]!, patch);
      expect(validateBuildingAnimationConfig(config).valid).toBe(false);
      expect(() => loadBuildingAnimationConfig(config)).toThrow();
    }
  });

  it('samples every transition deterministically with exact endpoints and finite intermediate transforms', () => {
    for (const effect of buildingTransitionCatalog) {
      const transition = { ...createDefaultBuildingTransition('a', 'b'), type: effect.id };
      const before = structuredClone(transition);
      const start = sampleBuildingTransition(transition, -1);
      const end = sampleBuildingTransition(transition, 2);
      expect(start.outgoing.opacity).toBe(1);
      expect(start.incoming.opacity).toBe(0);
      expect(end.outgoing.opacity).toBe(0);
      expect(end.incoming).toEqual({ opacity: 1, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 });
      for (const time of [0.001, 0.2, 0.5, 0.8, 0.999]) {
        const frame = sampleBuildingTransition(transition, time);
        expect(Object.values(frame.incoming).every(Number.isFinite)).toBe(true);
        expect(Object.values(frame.outgoing).every(Number.isFinite)).toBe(true);
        sampleBuildingTransition(transition, 0.9);
        expect(sampleBuildingTransition(transition, time)).toEqual(frame);
      }
      expect(transition).toEqual(before);
    }
  });

  it('uses complementary fades and a cut only at the next milestone', () => {
    const transition = {
      ...createDefaultBuildingTransition('a', 'b'),
      type: 'crossfade' as const,
      easing: 'linear' as const,
    };
    const frame = sampleBuildingTransition(transition, 0.3);
    expect(frame.outgoing.opacity).toBeCloseTo(0.7);
    expect(frame.incoming.opacity).toBeCloseTo(0.3);
    const cut = sampleBuildingTransition({ ...transition, type: 'cut' }, 0.999);
    expect(cut.incoming.opacity).toBe(0);
    expect(cut.outgoing.opacity).toBe(1);
  });

  it('pushes both stages in the selected direction and reverses only spatial direction', () => {
    const transition = {
      ...createDefaultBuildingTransition('a', 'b'),
      type: 'push' as const,
      easing: 'linear' as const,
      direction: 'bottom-to-top' as const,
    };
    const frame = sampleBuildingTransition(transition, 0.25);
    expect(frame.outgoing.y).toBe(-0.25);
    expect(frame.incoming.y).toBe(0.75);
    const reversed = sampleBuildingTransition({ ...transition, reverse: true }, 0.25);
    expect(reversed.amount).toBe(frame.amount);
    expect(reversed.outgoing.y).toBe(0.25);
    expect(reversed.incoming.y).toBe(-0.75);
    expect(transitionVector('top-left-to-bottom-right', false)).toEqual([1, 1]);
  });

  it('keeps authored zero rotation and protects easing from invalid playback positions', () => {
    const transition = {
      ...createDefaultBuildingTransition('a', 'b'),
      type: 'rotate' as const,
      angle: 0,
      easing: 'linear' as const,
    };
    expect(sampleBuildingTransition(transition, 0.5).incoming.rotation).toBe(0);
    expect(easeTransition(NaN, 'ease-out')).toBe(0);
    expect(easeTransition(Infinity, 'linear')).toBe(0);
    expect(easeTransition(0.5, 'ease-in')).toBe(0.125);
    expect(easeTransition(0.5, 'ease-out')).toBe(0.875);
  });
});
