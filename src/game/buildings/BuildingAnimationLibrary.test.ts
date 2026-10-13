import { describe, expect, it } from 'vitest';
import {
  animationLibraryAssetIds,
  createBuildingAnimationLibrary,
  createEmptyBuildingAnimationLibrary,
  createAnimationVariant,
  loadBuildingAnimationLibrary,
  replaceLibraryAnimation,
} from './BuildingAnimationLibrary';
import { validateBuildingAnimationConfig } from './BuildingAnimationConfig';

describe('entity animation library', () => {
  it('creates and round trips an entity with three independent empty compositions', () => {
    const library = createEmptyBuildingAnimationLibrary('new-entity');
    expect(library.entityId).toBe('new-entity');
    expect(library.animations.map((entry) => entry.config.timeline.durationSeconds)).toEqual([
      4, 2, 1,
    ]);
    for (const { config } of library.animations) {
      expect(config.stages).toEqual([]);
      expect(config.tracks).toEqual([]);
      expect(config.transitions).toEqual([]);
      expect(config.sounds).toEqual([]);
      expect(config.markers).toEqual([]);
      expect(validateBuildingAnimationConfig(config)).toEqual({ valid: true, errors: [] });
    }
    expect(animationLibraryAssetIds(library).size).toBe(0);
    expect(loadBuildingAnimationLibrary(JSON.parse(JSON.stringify(library)))).toEqual(library);
    library.animations[0]!.config.canvas.width = 600;
    expect(library.animations[1]!.config.canvas.width).toBe(1024);
  });
  it('creates independent construction, idle and destruction compositions with valid single-image variants', () => {
    const library = createBuildingAnimationLibrary();
    expect(library.animations.map((entry) => entry.kind)).toEqual([
      'construction',
      'idle',
      'destruction',
    ]);
    for (const entry of library.animations)
      expect(validateBuildingAnimationConfig(entry.config)).toEqual({ valid: true, errors: [] });
    const idle = library.animations[1]!.config;
    expect(idle.stages).toHaveLength(1);
    expect(idle.tracks).toEqual([]);
    expect(library.animations[2]!.config.tracks[0]?.property).toBe('opacity');
    idle.stages[0]!.x = 99;
    expect(library.animations[0]!.config.stages.at(-1)?.x).toBe(0);
  });
  it('edits a composition without changing the other tabs', () => {
    const library = createBuildingAnimationLibrary();
    const config = structuredClone(library.animations[1]!.config);
    config.timeline.durationSeconds = 8;
    const edited = replaceLibraryAnimation(library, 'idle', config);
    expect(edited.animations[1]!.config.timeline.durationSeconds).toBe(8);
    expect(edited.animations[0]).toBe(library.animations[0]);
    expect(library.animations[1]!.config.timeline.durationSeconds).toBe(2);
    expect(() => replaceLibraryAnimation(library, 'missing', config)).toThrow();
  });
  it('retains shared artwork referenced by inactive tabs when the active tab renames an asset', () => {
    const library = createBuildingAnimationLibrary();
    const originalId = library.animations[1]!.config.stages[0]!.assetId;
    const config = structuredClone(library.animations[0]!.config);
    config.stages.at(-1)!.assetId = 'renamed.png';
    const edited = replaceLibraryAnimation(library, 'construction', config);
    expect(animationLibraryAssetIds(edited).has(originalId)).toBe(true);
    expect(animationLibraryAssetIds(edited).has('renamed.png')).toBe(true);
    expect(animationLibraryAssetIds(edited).size).toBe(6);
  });
  it('duplicates full custom compositions and round trips every tab through entity JSON', () => {
    const library = createBuildingAnimationLibrary();
    const source = library.animations[2]!.config;
    source.markers = [{ id: 'death', name: 'Death', time: 0.8 }];
    const custom = createAnimationVariant(source, 'custom', 'custom-1');
    library.animations.push({ id: 'custom-1', name: 'Attack', kind: 'custom', config: custom });
    custom.markers[0]!.time = 0.3;
    expect(source.markers[0]!.time).toBe(0.8);
    expect(loadBuildingAnimationLibrary(JSON.parse(JSON.stringify(library)))).toEqual(library);
  });
  it('rejects duplicate IDs, duplicate built-in kinds and malformed compositions', () => {
    const library = createBuildingAnimationLibrary();
    library.animations.push(structuredClone(library.animations[0]!));
    expect(() => loadBuildingAnimationLibrary(library)).toThrow('unique IDs');
    library.animations.at(-1)!.id = 'duplicate-construction';
    expect(() => loadBuildingAnimationLibrary(library)).toThrow('unique');
    library.animations.pop();
    library.animations[1]!.config.timeline.durationSeconds = NaN;
    expect(() => loadBuildingAnimationLibrary(library)).toThrow('duration');
  });
});
