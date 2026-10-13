import { describe, expect, it } from 'vitest';
import {
  createDefaultBuildingAnimationConfig,
  loadBuildingAnimationConfig,
  validateBuildingAnimationConfig,
} from '../../game/buildings/BuildingAnimationConfig';
import {
  animationTextureAssets,
  createAnimationEffectStage,
  normalizeAnimationLayers,
} from '../../game/buildings/BuildingAnimationEffects';
import type { BuildingAnimationPreview } from '../../game/buildings/BuildingAnimationPreview';
import {
  animationLibraryAssetIds,
  createBuildingAnimationLibrary,
} from '../../game/buildings/BuildingAnimationLibrary';
import { attachAnimationNormalMap } from './AnimationImageImport';
import { AnimationHistory } from './AnimationHistory';

describe('image normal-map attachments', () => {
  it('adds a separately loadable texture and preserves artwork, keys and geometry', () => {
    const original = createDefaultBuildingAnimationConfig();
    const stage = original.stages[0]!;
    const { config, assetId } = attachAnimationNormalMap(original, stage.id);
    expect(config.stages[0]).toEqual({ ...stage, normalMapAssetId: assetId });
    expect({ ...config, stages: original.stages }).toEqual(original);
    expect(stage.normalMapAssetId).toBeUndefined();
    expect(animationTextureAssets(config)).toContain(assetId);
    expect(loadBuildingAnimationConfig(JSON.parse(JSON.stringify(config)))).toEqual(config);
  });

  it('replacement reserves existing normal maps across animation tabs and presets', () => {
    const original = createDefaultBuildingAnimationConfig();
    const id = original.stages[0]!.id;
    const first = attachAnimationNormalMap(original, id);
    const library = createBuildingAnimationLibrary(first.config);
    const reserved = `${original.stages[0]!.assetId.replace(/\.[^/.]+$/, '')}_normal-2.png`;
    library.animations[1]!.config.stages[0]!.normalMapAssetId = reserved;
    library.animations[0]!.config.effectPresets = [
      {
        id: 'saved',
        name: 'Saved',
        stages: [first.config.stages[0]!],
        tracks: [],
      },
    ];
    const ids = animationLibraryAssetIds(library);
    expect(ids).toContain(first.assetId);
    expect(ids).toContain(reserved);
    const replacement = attachAnimationNormalMap(first.config, id, ids);
    expect(replacement.assetId).not.toBe(first.assetId);
    expect(ids.has(replacement.assetId)).toBe(false);
    expect(first.config.stages[0]!.normalMapAssetId).toBe(first.assetId);
  });

  it('rejects locked, procedural and missing targets and invalid resource references', () => {
    const original = createDefaultBuildingAnimationConfig();
    const stage = original.stages[0]!;
    stage.locked = true;
    expect(() => attachAnimationNormalMap(original, stage.id)).toThrow();
    expect(() => attachAnimationNormalMap(original, 'missing')).toThrow();
    stage.locked = false;
    const procedural = createAnimationEffectStage(original, 'particles', 'particles', 'sparks');
    original.stages.push(procedural);
    normalizeAnimationLayers(original);
    expect(validateBuildingAnimationConfig(original).valid).toBe(true);
    expect(() => attachAnimationNormalMap(original, procedural.id)).toThrow();
    for (const value of ['', 'blob:temporary', 123]) {
      Object.assign(stage, { normalMapAssetId: value });
      expect(validateBuildingAnimationConfig(original).valid).toBe(false);
    }
    delete stage.normalMapAssetId;
    procedural.normalMapAssetId = 'art_normal.png';
    expect(validateBuildingAnimationConfig(original).valid).toBe(false);
  });

  it('undo and redo restore both the map binding and its source URL', () => {
    const original = createDefaultBuildingAnimationConfig();
    const before: BuildingAnimationPreview = {
      config: original,
      sourceUrls: {},
      progress: 0,
      visible: true,
      onionSkinStageIndex: null,
      sourceRevision: 0,
      position: null,
      opacity: 1,
      showHitbox: true,
    };
    const { config, assetId } = attachAnimationNormalMap(original, original.stages[0]!.id);
    const attached = {
      ...before,
      config,
      sourceUrls: { [assetId]: 'blob:normal' },
      sourceRevision: 1,
    };
    const history = new AnimationHistory<typeof before>();
    history.remember(before);
    const undone = history.restore('undo', attached)!;
    expect(undone).toEqual({ ...before, sourceRevision: 2 });
    expect(history.restore('redo', undone)).toEqual({ ...attached, sourceRevision: 3 });
  });
});
