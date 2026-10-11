import { describe, expect, it } from 'vitest';
import { sampleRockLayerMask, type RockLayerMask } from './RockLayerMask';

const mask: RockLayerMask = {
  sourceId: 'test',
  tileWidthMeters: 4,
  offsetsMeters: [-1, -0.5, 0.5, 1],
  orientation: 'sequential',
};

describe('Rock layer alpha profile', () => {
  it('repeats a serializable profile in world space', () => {
    expect(sampleRockLayerMask(mask, 0)).toBe(-1);
    expect(sampleRockLayerMask(mask, 2)).toBe(0.5);
    expect(sampleRockLayerMask(mask, 4)).toBe(-1);
  });

  it('mirrors every other tile without randomness', () => {
    const mirrored = { ...mask, orientation: 'mirrored' as const };
    expect(sampleRockLayerMask(mirrored, 0.5)).toBe(sampleRockLayerMask(mirrored, 7.5));
  });
});
