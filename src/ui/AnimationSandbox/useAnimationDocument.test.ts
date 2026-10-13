// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveAnimationDraft } from './AnimationDraft';
import { useAnimationDocument, type AnimationDocument } from './useAnimationDocument';

vi.mock('./AnimationDraft', () => ({
  loadAnimationDraft: vi.fn().mockResolvedValue(undefined),
  saveAnimationDraft: vi.fn().mockResolvedValue(undefined),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let container: HTMLDivElement;
let documentState: AnimationDocument;
beforeEach(async () => {
  vi.mocked(saveAnimationDraft).mockReset().mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  function Harness() {
    documentState = useAnimationDocument();
    return null;
  }
  await act(async () => root.render(createElement(Harness)));
  expect(documentState.ready).toBe(true);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
describe('entity create and save', () => {
  it('saves before creating an empty entity, resets placement and restores the old entity with Undo', async () => {
    act(() => documentState.update({ ...documentState.preview, position: { x: 12, y: 34 } }));
    const previous = documentState.preview;
    await act(async () => {
      expect(await documentState.createEntity()).toBe(true);
    });
    expect(saveAnimationDraft).toHaveBeenCalledWith(
      expect.objectContaining({ library: previous.library }),
    );
    expect(documentState.preview.library.entityId).not.toBe(previous.library.entityId);
    expect(
      documentState.preview.library.animations.every(({ config }) => config.stages.length === 0),
    ).toBe(true);
    expect(documentState.preview.position).toBeNull();
    expect(documentState.canUndo).toBe(true);
    act(() => documentState.undo());
    expect(documentState.preview.library).toEqual(previous.library);
    expect(documentState.preview.position).toEqual({ x: 12, y: 34 });
  });
  it('leaves the current entity intact when saving fails', async () => {
    vi.mocked(saveAnimationDraft).mockRejectedValueOnce(new Error('quota exceeded'));
    const previous = documentState.preview;
    await act(async () => {
      expect(await documentState.createEntity()).toBe(false);
    });
    expect(documentState.preview).toBe(previous);
    expect(documentState.error).toContain('quota exceeded');
    expect(documentState.canUndo).toBe(false);
  });
  it('saves an empty entity explicitly and reports successful completion', async () => {
    await act(async () => {
      await documentState.createEntity();
    });
    await act(async () => {
      expect(await documentState.saveNow()).toBe(true);
    });
    expect(documentState.draftStatus).toBe('Draft saved locally');
    expect(saveAnimationDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({
        config: documentState.preview.config,
        library: documentState.preview.library,
        activeAnimationId: 'construction',
        sources: {},
        position: null,
      }),
    );
  });
});
