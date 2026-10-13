import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyBuildingAnimationLibrary } from '../../game/buildings/BuildingAnimationLibrary';
import { loadAnimationDraft, saveAnimationDraft, type AnimationDraft } from './AnimationDraft';

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('ballistics-animation-drafts');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
});
function draft(entityId: string): AnimationDraft {
  const library = createEmptyBuildingAnimationLibrary(entityId);
  return {
    library,
    config: library.animations[0]!.config,
    activeAnimationId: 'construction',
    sources: { 'asset.png': new Blob(['png-bytes'], { type: 'image/png' }) },
    position: null,
  };
}
describe('local entity drafts', () => {
  it('preserves previous entities and their resources when a new current draft is saved', async () => {
    await saveAnimationDraft(draft('first'));
    await saveAnimationDraft(draft('second'));
    expect((await loadAnimationDraft())!.library!.entityId).toBe('second');
    const archived = (await loadAnimationDraft('first'))!;
    expect(archived.library!.entityId).toBe('first');
    expect(archived.config.stages).toEqual([]);
    expect(await archived.sources['asset.png']!.text()).toBe('png-bytes');
    expect(archived.sources['asset.png']!.type).toBe('image/png');
    expect(await loadAnimationDraft('missing')).toBeUndefined();
  });
  it('updates the saved entity without overwriting other entity archives', async () => {
    await saveAnimationDraft(draft('first'));
    await saveAnimationDraft(draft('second'));
    const updated = draft('first');
    updated.config.timeline.durationSeconds = 8;
    await saveAnimationDraft(updated);
    expect((await loadAnimationDraft('first'))!.config.timeline.durationSeconds).toBe(8);
    expect((await loadAnimationDraft('second'))!.config.timeline.durationSeconds).toBe(4);
  });
});
