import {
  loadBuildingAnimationConfig,
  type BuildingAnimationConfig,
} from '../../game/buildings/BuildingAnimationConfig';
import type { Vec2 } from '../../game/math/Vec2';
import {
  loadBuildingAnimationLibrary,
  type BuildingAnimationLibrary,
} from '../../game/buildings/BuildingAnimationLibrary';

export interface AnimationDraft {
  config: BuildingAnimationConfig;
  sources: Record<string, Blob>;
  position: Vec2 | null;
  library?: BuildingAnimationLibrary;
  activeAnimationId?: string;
}

function openDraftDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open('ballistics-animation-drafts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Draft database is blocked by another tab.'));
    };
  });
}

export async function loadAnimationDraft(): Promise<AnimationDraft | undefined> {
  const database = await openDraftDatabase();
  try {
    const draft = await new Promise<AnimationDraft | undefined>((resolve, reject) => {
      const request = database.transaction('drafts').objectStore('drafts').get('current');
      request.onsuccess = () => resolve(request.result as AnimationDraft | undefined);
      request.onerror = () => reject(request.error);
    });
    if (!draft) return undefined;
    if (
      !draft.sources ||
      typeof draft.sources !== 'object' ||
      Object.values(draft.sources).some((value) => !(value instanceof Blob))
    )
      throw new Error('Invalid images or audio resources in the stored animation draft.');
    if (
      draft.position !== null &&
      (!draft.position || !Number.isFinite(draft.position.x) || !Number.isFinite(draft.position.y))
    )
      throw new Error('Invalid placement in the stored animation draft.');
    const library = draft.library ? loadBuildingAnimationLibrary(draft.library) : undefined;
    if (library && !library.animations.some((entry) => entry.id === draft.activeAnimationId))
      throw new Error('Invalid active animation in stored draft.');
    return { ...draft, library, config: loadBuildingAnimationConfig(draft.config) };
  } finally {
    database.close();
  }
}

export async function saveAnimationDraft(draft: AnimationDraft): Promise<void> {
  const database = await openDraftDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('drafts', 'readwrite');
      transaction.objectStore('drafts').put(draft, 'current');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}
