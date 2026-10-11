import { describe, expect, it } from 'vitest';
import {
  createDefaultBuildingAnimationConfig,
  loadBuildingAnimationConfig,
  validateBuildingAnimationConfig,
  type BuildingAnimationSound,
} from '../../game/buildings/BuildingAnimationConfig';
import {
  audioWaveform,
  moveAnimationSound,
  sampleAnimationSounds,
  splitAnimationSound,
  trimAnimationSound,
} from './AnimationAudio';

const sound = (patch: Partial<BuildingAnimationSound> = {}): BuildingAnimationSound => ({
  id: 'sound-1',
  name: 'Build',
  assetId: 'audio/build.wav',
  sourceDuration: 10,
  startSeconds: 1,
  offsetSeconds: 2,
  durationSeconds: 4,
  volume: 0.8,
  muted: false,
  solo: false,
  fadeInSeconds: 1,
  fadeOutSeconds: 1,
  waveform: [0, 0.2, 1],
  ...patch,
});

describe('animation audio editing and synchronized sampling', () => {
  it('uses half-open clip intervals, source offsets and fade envelopes', () => {
    expect(sampleAnimationSounds([sound()], 0.99)).toEqual([]);
    expect(sampleAnimationSounds([sound()], 5)).toEqual([]);
    expect(sampleAnimationSounds([sound()], 1)[0]).toMatchObject({
      offset: 2,
      gain: 0,
      remaining: 4,
    });
    expect(sampleAnimationSounds([sound()], 1.5)[0]).toMatchObject({
      offset: 2.5,
      gain: 0.4,
      remaining: 3.5,
    });
    expect(sampleAnimationSounds([sound()], 3)[0]?.gain).toBe(0.8);
    expect(sampleAnimationSounds([sound()], 4.5)[0]?.gain).toBe(0.4);
  });
  it('mutes clips and gives audible solo tracks exclusive playback', () => {
    const clips = [sound(), sound({ id: 'solo', solo: true }), sound({ id: 'muted', muted: true })];
    expect(sampleAnimationSounds(clips, 2).map((item) => item.sound.id)).toEqual(['solo']);
    clips[1]!.muted = true;
    expect(sampleAnimationSounds(clips, 2).map((item) => item.sound.id)).toEqual(['sound-1']);
  });
  it('clamps dragging at composition boundaries without changing source timing', () => {
    expect(moveAnimationSound(sound(), -100, 8)).toMatchObject({
      startSeconds: 0,
      offsetSeconds: 2,
      durationSeconds: 4,
    });
    expect(moveAnimationSound(sound(), 100, 8).startSeconds).toBe(4);
  });
  it('trims left by slipping the source, and constrains extensions to the source bounds', () => {
    expect(trimAnimationSound(sound(), 'left', 1, 0.1)).toMatchObject({
      startSeconds: 2,
      offsetSeconds: 3,
      durationSeconds: 3,
    });
    expect(trimAnimationSound(sound(), 'left', -100, 0.1)).toMatchObject({
      startSeconds: 0,
      offsetSeconds: 1,
      durationSeconds: 5,
    });
    const shortened = trimAnimationSound(sound(), 'right', -100, 0.1);
    expect(shortened.durationSeconds).toBeCloseTo(0.1);
    expect(shortened.fadeInSeconds + shortened.fadeOutSeconds).toBeLessThanOrEqual(
      shortened.durationSeconds,
    );
    expect(trimAnimationSound(sound(), 'right', 100, 0.1).durationSeconds).toBe(8);
  });
  it('splits continuously at the playhead, preserves outer fades and ignores boundary splits', () => {
    const [left, right] = splitAnimationSound(sound(), 2.5, 'split');
    expect(left).toMatchObject({ durationSeconds: 1.5, fadeOutSeconds: 0, fadeInSeconds: 1 });
    expect(right).toMatchObject({
      id: 'split',
      startSeconds: 2.5,
      offsetSeconds: 3.5,
      durationSeconds: 2.5,
      fadeInSeconds: 0,
      fadeOutSeconds: 1,
    });
    expect(sampleAnimationSounds([left!, right!], 2.5)).toHaveLength(1);
    expect(splitAnimationSound(sound(), 1, 'split')).toEqual([sound()]);
  });
  it('builds peaks from all channels, including negative amplitudes and the final samples', () => {
    expect(
      audioWaveform([new Float32Array([0, -0.5, 0.2, 0.1]), new Float32Array([0.8, 0, 0, 1])], 2),
    ).toEqual([expect.closeTo(0.8), 1]);
    expect(audioWaveform([], 256)).toEqual([]);
    expect(audioWaveform([new Float32Array([0, 1])])).toEqual([0, 1]);
  });
  it('round trips audio and markers in v6 and migrates v5 without losing layer timing', () => {
    const config = createDefaultBuildingAnimationConfig();
    config.sounds = [sound()];
    config.markers = [{ id: 'impact', name: 'Impact', time: 0.5 }];
    expect(loadBuildingAnimationConfig(JSON.parse(JSON.stringify(config)))).toEqual(config);
    const legacy = { ...config, schemaVersion: 5, markers: undefined };
    const migrated = loadBuildingAnimationConfig(legacy);
    expect(migrated.markers).toEqual([]);
    expect(migrated.stages).toEqual(config.stages);
  });
  it('rejects malformed audio, invalid trims, duplicate markers and expired object URLs', () => {
    for (const patch of [
      { assetId: 'blob:expired' },
      { offsetSeconds: 9 },
      { volume: 2 },
      { fadeInSeconds: 8 },
      { waveform: [NaN] },
      { durationSeconds: -1 },
    ]) {
      const config = createDefaultBuildingAnimationConfig();
      config.sounds = [sound(patch)];
      expect(validateBuildingAnimationConfig(config).valid).toBe(false);
    }
    const config = createDefaultBuildingAnimationConfig();
    config.markers = [
      { id: 'a', name: 'A', time: 0 },
      { id: 'a', name: 'B', time: 1 },
    ];
    expect(() => loadBuildingAnimationConfig(config)).toThrow('Marker');
  });
});
