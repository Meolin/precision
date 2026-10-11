import { describe, expect, it } from 'vitest';
import {
  createDefaultBuildingAnimationConfig,
  validateBuildingAnimationConfig,
} from '../../game/buildings/BuildingAnimationConfig';
import type { BuildingAnimationPreview } from '../../game/buildings/BuildingAnimationPreview';
import {
  editAnimationValue,
  sampleAnimationStage,
  snapAnimationTime,
  renameAnimationAsset,
  resizeAnimationDuration,
  minimumAnimationDuration,
} from './AnimationEditing';
import { AnimationHistory } from './AnimationHistory';

function preview(): BuildingAnimationPreview {
  return {
    config: createDefaultBuildingAnimationConfig(),
    sourceUrls: {},
    sourceRevision: 0,
    visible: true,
    progress: 0,
    onionSkinStageIndex: null,
    position: null,
    opacity: 1,
    showHitbox: true,
  };
}

describe('shared animation editing', () => {
  it('keeps markers, keys and audio synchronized in seconds when the composition is extended', () => {
    const config = createDefaultBuildingAnimationConfig();
    config.markers = [{ id: 'event', name: 'Event', time: 0.25 }];
    editAnimationValue(config, config.stages[0]!.id, 'x', 20, 0.5, true, true);
    const next = resizeAnimationDuration(config, 8);
    expect(next.markers[0]!.time * 8).toBe(1);
    expect(next.tracks[0]!.keys[0]!.time * 8).toBe(2);
    expect(next.stages[2]!.milestone * 8).toBeCloseTo(config.stages[2]!.milestone * 4);
    expect(next.stages.at(-1)!.outPoint).toBe(1);
    expect(next.timeline.workAreaEnd).toBe(1);
    expect(config.timeline.durationSeconds).toBe(4);
    expect(validateBuildingAnimationConfig(next).valid).toBe(true);
  });
  it('prevents duration changes that would discard keys, markers or layer starts', () => {
    const config = createDefaultBuildingAnimationConfig();
    config.markers = [{ id: 'late', name: 'Late', time: 1 }];
    expect(minimumAnimationDuration(config)).toBe(4);
    expect(() => resizeAnimationDuration(config, 3.9)).toThrow('cut existing');
    expect(() => resizeAnimationDuration(config, NaN)).toThrow();
  });
  it('edits the base value without enabling animation when auto-key is off', () => {
    const config = createDefaultBuildingAnimationConfig();
    editAnimationValue(config, config.stages[0]!.id, 'x', 12, 0.25, true, false);
    expect(config.stages[0]!.x).toBe(12);
    expect(config.tracks).toEqual([]);
  });
  it('creates keys without rewriting the base transform, samples the current frame', () => {
    const config = createDefaultBuildingAnimationConfig();
    const id = config.stages[0]!.id;
    editAnimationValue(config, id, 'x', 0, 0, true, true, () => 'start');
    editAnimationValue(config, id, 'x', 100, 1, true, true, () => 'end');
    expect(config.stages[0]!.x).toBe(0);
    expect(sampleAnimationStage(config, id, 0.25)?.x).toBe(25);
    editAnimationValue(config, id, 'x', 30, 0.25, true, false, () => 'middle');
    expect(config.tracks[0]!.keys.map((key) => key.time)).toEqual([0, 0.25, 1]);
    expect(validateBuildingAnimationConfig(config).valid).toBe(true);
  });
  it('uses the same optional frame snap and clamps property values', () => {
    const config = createDefaultBuildingAnimationConfig();
    const id = config.stages[0]!.id;
    expect(snapAnimationTime(0.1234, config, false)).toBeCloseTo(0.1234);
    expect(snapAnimationTime(0.1234, config, true)).toBeCloseTo(15 / 120);
    editAnimationValue(config, id, 'opacity', 5, 0, true, false);
    editAnimationValue(config, id, 'scaleX', -1, 0, true, false);
    expect(config.stages[0]!.opacity).toBe(1);
    expect(config.stages[0]!.scaleX).toBe(0.001);
    editAnimationValue(config, id, 'x', NaN, 0, true, false);
    expect(config.stages[0]!.x).toBe(0);
  });
  it('rejects asset collisions atomically, including blob IDs', () => {
    const original = preview();
    const first = original.config.stages[0]!;
    const second = original.config.stages[1]!;
    original.sourceUrls = { [first.assetId]: 'blob:first', [second.assetId]: 'blob:second' };
    const before = structuredClone(original);
    expect(() => renameAnimationAsset(original, first.id, second.assetId)).toThrow();
    expect(() => renameAnimationAsset(original, first.id, 'blob:invalid')).toThrow();
    expect(original).toEqual(before);
    const renamed = renameAnimationAsset(original, first.id, ' buildings/new.png ');
    expect(renamed.sourceUrls['buildings/new.png']).toBe('blob:first');
    expect(renamed.sourceUrls[second.assetId]).toBe('blob:second');
    expect(renamed.sourceUrls[first.assetId]).toBeUndefined();
  });
  it('undoes inspector, key editing and PNG replacement through one resource-aware history', () => {
    const history = new AnimationHistory();
    const original = preview();
    const first = original.config.stages[0]!;
    original.sourceUrls = { [first.assetId]: 'blob:original' };
    history.remember(original);
    const edited = { ...original, config: structuredClone(original.config) };
    editAnimationValue(edited.config, first.id, 'x', 42, 0, true, true, () => 'inspector-key');
    history.remember(edited);
    const imported = {
      ...preview(),
      sourceRevision: 9,
      sourceUrls: { 'new.png': 'blob:replacement' },
    };
    const restored = history.restore('undo', imported)!;
    expect(restored.config.tracks[0]!.keys[0]!.value).toBe(42);
    expect(restored.sourceUrls[first.assetId]).toBe('blob:original');
    expect(restored.sourceRevision).toBe(10);
    const base = history.restore('undo', restored)!;
    expect(base.config.tracks).toEqual([]);
    const redone = history.restore('redo', base)!;
    expect(redone.config.tracks[0]!.keys[0]!.value).toBe(42);
    redone.config.stages[0]!.x = 999;
    expect(original.config.stages[0]!.x).toBe(0);
  });
  it('bounds history and clears redo when branching', () => {
    const history = new AnimationHistory();
    const value = preview();
    for (let index = 0; index < 70; index++) history.remember(value);
    expect(history.undo.length).toBe(60);
    history.restore('undo', value);
    expect(history.redo.length).toBe(1);
    history.remember(value);
    expect(history.redo).toEqual([]);
  });
});
