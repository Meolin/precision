import { describe, expect, it } from 'vitest';
import {
  createDefaultBuildingAnimationConfig,
  validateBuildingAnimationConfig,
} from '../../game/buildings/BuildingAnimationConfig';
import { createAnimationEffectStage } from '../../game/buildings/BuildingAnimationEffects';
import { importAnimationImages } from './AnimationImageImport';

const artwork = {
  name: 'final.png',
  width: 100,
  height: 200,
  bounds: { x: 5, y: 10, width: 90, height: 180 },
};
function documentWithKeys() {
  const config = createDefaultBuildingAnimationConfig();
  config.tracks.push({
    stageId: config.stages[0]!.id,
    property: 'x',
    keys: [
      {
        id: 'move',
        time: 0.1,
        value: 24,
        interpolation: 'linear',
        bezier: [0.4, 0, 0.2, 1],
      },
    ],
  });
  return config;
}

describe('PNG add and replace', () => {
  it('adds unique artwork without changing existing keys, geometry or transitions', () => {
    const original = documentWithKeys();
    const { config, stages } = importAnimationImages(
      original,
      [artwork, artwork],
      'construction',
      'add',
    );
    expect(config.stages).toHaveLength(7);
    expect(config.tracks).toEqual(original.tracks);
    expect(config.canvas).toEqual(original.canvas);
    expect(config.origin).toEqual(original.origin);
    expect(config.transitions.slice(0, 4)).toEqual(original.transitions);
    expect(stages[0]!.milestone).toBeGreaterThan(0.85);
    expect(stages[1]!.assetId).not.toBe(stages[0]!.assetId);
    expect(validateBuildingAnimationConfig(config)).toEqual({ valid: true, errors: [] });
    expect(original.stages).toHaveLength(5);
  });

  it('replacement removes image tracks and dependent filters but preserves procedural resources', () => {
    const original = documentWithKeys();
    const particles = createAnimationEffectStage(original, 'sparks', 'particles', 'sparks');
    particles.emitterShape = 'contour';
    particles.shapeSourceId = original.stages[0]!.id;
    const filter = createAnimationEffectStage(
      original,
      'image-glow',
      'filter',
      'glow',
      original.stages[0]!.id,
    );
    original.stages.push(particles, filter);
    const { config } = importAnimationImages(original, [artwork], 'construction', 'replace');
    expect(config.stages.map((stage) => stage.id)).toContain('sparks');
    expect(config.stages.map((stage) => stage.id)).not.toContain('image-glow');
    expect(config.tracks).toEqual([]);
    expect(config.canvas).toEqual({ width: 100, height: 200 });
    expect(config.hitbox).toMatchObject(artwork.bounds);
    expect(config.transitions).toEqual([]);
    expect(config.stages.find((stage) => stage.id === particles.id)).toMatchObject({
      emitterShape: 'point',
      shapeSourceId: '',
    });
    expect(validateBuildingAnimationConfig(config)).toEqual({ valid: true, errors: [] });
  });

  it('does not overwrite artwork shared with another animation', () => {
    const { stages } = importAnimationImages(documentWithKeys(), [artwork], 'idle', 'add', [
      'buildings/idle/final.png',
    ]);
    expect(stages[0]!.assetId).toBe('buildings/idle/final-2.png');
  });

  it('rejects adding a stage beyond the end without mutating the document', () => {
    const original = documentWithKeys();
    original.stages.at(-1)!.milestone = 1;
    const before = structuredClone(original);
    expect(() => importAnimationImages(original, [artwork], 'construction', 'add')).toThrow(
      'Увеличьте длительность',
    );
    expect(original).toEqual(before);
  });
});
