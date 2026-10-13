import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultBuildingAnimationConfig } from '../../game/buildings/BuildingAnimationConfig';
import { loadAnimationDraft, saveAnimationDraft, type AnimationDraft } from './AnimationDraft';
import { createBuildingAnimationLibrary } from '../../game/buildings/BuildingAnimationLibrary';
import { AnimationHistory } from './AnimationHistory';
import type { AnimationDocumentState } from './useAnimationDocument';

function mockDatabase(initial?: AnimationDraft) {
  let stored = initial;
  const close = vi.fn();
  const database = {
    close,
    transaction: () => {
      const transaction = {
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onabort: null as (() => void) | null,
        objectStore: () => ({
          get: () => {
            const request = { result: stored, onsuccess: null as (() => void) | null };
            queueMicrotask(() => request.onsuccess?.());
            return request;
          },
          put: (draft: AnimationDraft, key: string) => {
            expect([
              'current',
              ...(draft.library ? [`entity:${draft.library.entityId}`] : []),
            ]).toContain(key);
            stored = structuredClone(draft);
            queueMicrotask(() => transaction.oncomplete?.());
          },
        }),
      };
      return transaction;
    },
  };
  vi.stubGlobal('indexedDB', {
    open: () => {
      const request = { result: database, onsuccess: null as (() => void) | null };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  });
  return { close };
}

afterEach(() => vi.unstubAllGlobals());

describe('local animation draft storage', () => {
  it('restores the normal-map binding and its PNG alongside the image', async () => {
    mockDatabase();
    const config = createDefaultBuildingAnimationConfig();
    const stage = config.stages[0]!;
    stage.normalMapAssetId = 'art_normal.png';
    await saveAnimationDraft({
      config,
      position: null,
      sources: {
        [stage.assetId]: new Blob(['art'], { type: 'image/png' }),
        [stage.normalMapAssetId]: new Blob(['normals'], { type: 'image/png' }),
      },
    });
    const restored = await loadAnimationDraft();
    expect(restored?.config.stages[0]!.normalMapAssetId).toBe('art_normal.png');
    expect(await restored?.sources['art_normal.png']?.text()).toBe('normals');
  });
  it('restores all animation tabs and their shared PNG and audio files after reopening', async () => {
    mockDatabase();
    const library = createBuildingAnimationLibrary();
    library.animations[1]!.config.markers = [{ id: 'idle-event', name: 'Idle event', time: 0.2 }];
    const draft: AnimationDraft = {
      library,
      activeAnimationId: 'idle',
      config: library.animations[1]!.config,
      position: null,
      sources: {
        'art.png': new Blob(['png'], { type: 'image/png' }),
        'sound.wav': new Blob(['audio'], { type: 'audio/wav' }),
      },
    };
    await saveAnimationDraft(draft);
    const restored = await loadAnimationDraft();
    expect(restored?.library).toEqual(library);
    expect(restored?.activeAnimationId).toBe('idle');
    expect(await restored?.sources['sound.wav']?.text()).toBe('audio');
    expect(restored?.sources['art.png']?.type).toBe('image/png');
  });
  it('undo restores deleted tabs, selected composition and audio resource bindings together', () => {
    const library = createBuildingAnimationLibrary();
    const original: AnimationDocumentState = {
      library,
      activeAnimationId: 'idle',
      config: library.animations[1]!.config,
      progress: 0.4,
      visible: true,
      onionSkinStageIndex: null,
      sourceUrls: { 'sound.wav': 'blob:audio' },
      sourceRevision: 2,
      position: null,
      opacity: 1,
      showHitbox: true,
    };
    const history = new AnimationHistory<AnimationDocumentState>();
    history.remember(original);
    original.library.animations[1]!.name = 'Changed after snapshot';
    const current = {
      ...original,
      activeAnimationId: 'construction',
      library: { ...library, animations: [library.animations[0]!] },
      sourceUrls: {},
    };
    const undo = history.restore('undo', current)!;
    expect(undo.library.animations).toHaveLength(3);
    expect(undo.library.animations[1]!.name).toBe('Idle');
    expect(undo.activeAnimationId).toBe('idle');
    expect(undo.sourceUrls['sound.wav']).toBe('blob:audio');
    expect(undo.sourceRevision).toBe(3);
    expect(history.restore('redo', undo)?.library.animations).toHaveLength(1);
  });
  it('round trips configuration, image blobs and placement together', async () => {
    const { close } = mockDatabase();
    const config = createDefaultBuildingAnimationConfig();
    const draft = {
      config,
      sources: { [config.stages[0]!.assetId]: new Blob(['png'], { type: 'image/png' }) },
      position: { x: 12, y: 34 },
    };
    await saveAnimationDraft(draft);
    const restored = await loadAnimationDraft();
    expect(restored?.config).toEqual(config);
    expect(restored?.position).toEqual(draft.position);
    expect(await restored?.sources[config.stages[0]!.assetId]?.text()).toBe('png');
    expect(close).toHaveBeenCalledTimes(2);
  });
  it('returns no draft for an empty store', async () => {
    mockDatabase();
    expect(await loadAnimationDraft()).toBeUndefined();
  });
  it('rejects corrupted image resources without rewriting the saved record', async () => {
    const { close } = mockDatabase({
      config: createDefaultBuildingAnimationConfig(),
      sources: { broken: 'blob:expired' as unknown as Blob },
      position: null,
    });
    await expect(loadAnimationDraft()).rejects.toThrow('Invalid images');
    expect(close).toHaveBeenCalledOnce();
  });
  it('surfaces unavailable storage', async () => {
    vi.stubGlobal('indexedDB', {
      open: () => {
        throw new Error('Storage disabled');
      },
    });
    await expect(
      saveAnimationDraft({
        config: createDefaultBuildingAnimationConfig(),
        sources: {},
        position: null,
      }),
    ).rejects.toThrow('Storage disabled');
  });
});
