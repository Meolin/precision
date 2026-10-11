import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createDefaultBuildingAnimationConfig,
  validateBuildingAnimationConfig,
  type BuildingAnimationConfig,
} from '../../game/buildings/BuildingAnimationConfig';
import type {
  BuildingAnimationAssetStatus,
  BuildingAnimationPreview,
} from '../../game/buildings/BuildingAnimationPreview';
import { AnimationHistory } from './AnimationHistory';
import { loadAnimationDraft, saveAnimationDraft } from './AnimationDraft';
import {
  animationLibraryAssetIds,
  createBuildingAnimationLibrary,
  replaceLibraryAnimation,
  type BuildingAnimationLibrary,
} from '../../game/buildings/BuildingAnimationLibrary';
import { useAnimationAudio } from './useAnimationAudio';
import { AnimationEditorSession } from './AnimationEditorSession';

export interface AnimationDocumentState extends BuildingAnimationPreview {
  library: BuildingAnimationLibrary;
  activeAnimationId: string;
}

export function useAnimationDocument() {
  const [session] = useState(() => new AnimationEditorSession());
  const [preview, setPreview] = useState<AnimationDocumentState>(() => ({
    config: createDefaultBuildingAnimationConfig(),
    progress: 0,
    visible: false,
    onionSkinStageIndex: null,
    sourceUrls: {},
    sourceRevision: 0,
    position: null,
    opacity: 1,
    showHitbox: true,
    library: createBuildingAnimationLibrary(),
    activeAnimationId: 'construction',
  }));
  const current = useRef(preview);
  const [history] = useState(() => new AnimationHistory<AnimationDocumentState>());
  const [, setHistoryVersion] = useState(0);
  const [playing, setPlayingState] = useState(false);
  const [loop, setLoop] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [snap, setSnap] = useState(true);
  const [autoKey, setAutoKey] = useState(false);
  const [timelineMode, setTimelineMode] = useState<'animation' | 'audio' | 'both'>('animation');
  const [timelineZooms, setTimelineZooms] = useState<Record<string, number>>({});
  const timelineZoom =
    timelineZooms[preview.activeAnimationId] ?? session.view(preview.activeAnimationId).zoom;
  const setTimelineZoom = (zoom: number) => {
    session.view(preview.activeAnimationId).zoom = zoom;
    setTimelineZooms((values) => ({ ...values, [preview.activeAnimationId]: zoom }));
  };
  const [timelineScrolls, setTimelineScrolls] = useState<Record<string, number>>({});
  const timelineScrollLeft =
    timelineScrolls[preview.activeAnimationId] ??
    session.view(preview.activeAnimationId).scrollLeft;
  const setTimelineScrollLeft = (left: number) =>
    setTimelineScrolls((values) => ({ ...values, [preview.activeAnimationId]: left }));
  const [ready, setReady] = useState(false);
  const [draftStatus, setDraftStatus] = useState('Loading draft…');
  const [error, setError] = useState('');
  const [assets, setAssets] = useState<BuildingAnimationAssetStatus>({
    loading: false,
    loaded: [],
    failed: [],
  });
  const sources = useRef(new Map<string, Blob>());
  const editRevision = useRef(0);
  const saveQueue = useRef(Promise.resolve());
  const loadedDraft = useRef(false);
  const audio = useAnimationAudio(preview, playing, speed);
  const enableAudio = audio.enable;
  const setPlaying = useCallback(
    (value: boolean) => {
      if (value) enableAudio();
      setPlayingState(value);
    },
    [enableAudio],
  );
  const apply = useCallback((next: AnimationDocumentState) => {
    current.current = next;
    setPreview(next);
  }, []);
  const update = useCallback(
    (next: BuildingAnimationPreview, record = true) => {
      const previous = current.current;
      if (next.config !== previous.config) {
        const validation = validateBuildingAnimationConfig(next.config);
        if (!validation.valid) {
          setError(validation.errors[0] ?? 'Invalid configuration.');
          return;
        }
        if (record) history.remember(previous);
        setHistoryVersion((value) => value + 1);
      }
      if (
        next.config !== previous.config ||
        next.sourceUrls !== previous.sourceUrls ||
        next.position !== previous.position
      ) {
        editRevision.current++;
        setDraftStatus('Unsaved changes');
      }
      if (next.sourceRevision !== previous.sourceRevision)
        setAssets({ loading: true, loaded: [], failed: [] });
      setError('');
      const library =
        next.config === previous.config
          ? previous.library
          : replaceLibraryAnimation(previous.library, previous.activeAnimationId, next.config);
      const sourceUrls =
        next.config !== previous.config || next.sourceUrls !== previous.sourceUrls
          ? Object.fromEntries(
              [...animationLibraryAssetIds(library)].flatMap((id) => {
                const url = next.sourceUrls[id] ?? previous.sourceUrls[id];
                return url ? [[id, url]] : [];
              }),
            )
          : previous.sourceUrls;
      apply({
        ...previous,
        ...next,
        activeAnimationId: previous.activeAnimationId,
        library,
        sourceUrls,
      });
    },
    [apply, history],
  );
  const remember = useCallback(
    (config?: BuildingAnimationConfig) => {
      const value = current.current;
      const snapshotConfig = config ?? value.config;
      history.remember({
        ...value,
        config: snapshotConfig,
        library: replaceLibraryAnimation(value.library, value.activeAnimationId, snapshotConfig),
      });
      setHistoryVersion((value) => value + 1);
    },
    [history],
  );
  const restore = useCallback(
    (direction: 'undo' | 'redo') => {
      const next = history.restore(direction, current.current);
      if (!next) return;
      setPlaying(false);
      editRevision.current++;
      setDraftStatus('Unsaved changes');
      setAssets({ loading: true, loaded: [], failed: [] });
      apply(next);
      setHistoryVersion((value) => value + 1);
    },
    [apply, history, setPlaying],
  );
  const createSource = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob);
    sources.current.set(url, blob);
    return url;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const revision = editRevision.current;
    void loadAnimationDraft()
      .then((draft) => {
        if (cancelled) return;
        if (draft && editRevision.current === revision) {
          const sourceUrls: Record<string, string> = {};
          for (const [id, blob] of Object.entries(draft.sources))
            sourceUrls[id] = createSource(blob);
          const library = draft.library ?? createBuildingAnimationLibrary(draft.config);
          const activeAnimationId = draft.activeAnimationId ?? 'construction';
          apply({
            ...current.current,
            library,
            activeAnimationId,
            config: library.animations.find((entry) => entry.id === activeAnimationId)!.config,
            sourceUrls,
            position: draft.position,
            visible: true,
            sourceRevision: current.current.sourceRevision + 1,
          });
        }
        loadedDraft.current = true;
        setDraftStatus(
          editRevision.current === revision
            ? draft
              ? 'Draft restored'
              : 'New draft'
            : 'Unsaved changes',
        );
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setDraftStatus(
            `Draft unavailable: ${reason instanceof Error ? reason.message : String(reason)}`,
          );
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [apply, createSource]);

  useEffect(() => {
    if (!ready || (!loadedDraft.current && editRevision.current === 0)) return;
    const revision = editRevision.current;
    const timeout = window.setTimeout(() => {
      const storedSources: Record<string, Blob> = {};
      for (const [id, url] of Object.entries(preview.sourceUrls)) {
        const blob = sources.current.get(url);
        if (blob) storedSources[id] = blob;
      }
      setDraftStatus('Saving draft…');
      const draft = {
        config: preview.config,
        library: preview.library,
        activeAnimationId: preview.activeAnimationId,
        sources: storedSources,
        position: preview.position,
      };
      saveQueue.current = saveQueue.current
        .catch(() => undefined)
        .then(() => saveAnimationDraft(draft));
      void saveQueue.current
        .then(() => {
          if (revision === editRevision.current) setDraftStatus('Draft saved locally');
        })
        .catch((reason: unknown) => {
          if (revision === editRevision.current)
            setDraftStatus(
              `Draft not saved: ${reason instanceof Error ? reason.message : String(reason)}`,
            );
        });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [
    preview.config,
    preview.library,
    preview.activeAnimationId,
    preview.sourceUrls,
    preview.position,
    ready,
  ]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (
        draftStatus === 'Unsaved changes' ||
        draftStatus === 'Saving draft…' ||
        draftStatus.startsWith('Draft not saved:')
      ) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draftStatus]);

  useEffect(() => {
    const owned = sources.current;
    return () => {
      for (const url of owned.keys()) URL.revokeObjectURL(url);
      owned.clear();
    };
  }, []);

  useEffect(() => {
    // Keep URLs required by undo/redo. Defer retirement until consumers have switched documents.
    const timeout = window.setTimeout(() => {
      const retained = new Set(
        [current.current, ...history.undo, ...history.redo].flatMap((item) =>
          Object.values(item.sourceUrls),
        ),
      );
      for (const url of sources.current.keys())
        if (!retained.has(url)) {
          URL.revokeObjectURL(url);
          sources.current.delete(url);
        }
    }, 10000);
    return () => window.clearTimeout(timeout);
  }, [history, preview.config, preview.sourceUrls]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      const elapsed = last === null ? 0 : Math.min(0.25, (now - last) / 1000);
      last = now;
      const value = current.current;
      const timeline = value.config.timeline;
      const end = timeline.workAreaEnd;
      const start = timeline.workAreaStart;
      let progress = value.progress + (elapsed * speed) / timeline.durationSeconds;
      if (progress >= end) {
        progress = loop ? start + ((progress - start) % (end - start)) : end;
        if (!loop) setPlaying(false);
      }
      apply({ ...value, progress });
      if (loop || progress < end) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [apply, playing, loop, speed, setPlaying]);

  const editLibrary = useCallback(
    (
      library: BuildingAnimationLibrary,
      activeAnimationId = current.current.activeAnimationId,
      sourceUrls = current.current.sourceUrls,
    ) => {
      const entry = library.animations.find((item) => item.id === activeAnimationId);
      if (!entry) return;
      history.remember(current.current);
      setPlaying(false);
      editRevision.current++;
      setDraftStatus('Unsaved changes');
      setError('');
      apply({
        ...current.current,
        library,
        activeAnimationId,
        config: entry.config,
        sourceUrls,
        progress: 0,
        onionSkinStageIndex: null,
        sourceRevision: current.current.sourceRevision + 1,
      });
      setHistoryVersion((value) => value + 1);
    },
    [apply, history, setPlaying],
  );

  const selectAnimation = useCallback(
    (id: string) => {
      const value = current.current;
      const entry = value.library.animations.find((item) => item.id === id);
      if (!entry || id === value.activeAnimationId) return;
      setPlaying(false);
      editRevision.current++;
      setDraftStatus('Unsaved changes');
      setAssets({ loading: true, loaded: [], failed: [] });
      apply({
        ...value,
        activeAnimationId: id,
        config: entry.config,
        progress: 0,
        onionSkinStageIndex: null,
        sourceRevision: value.sourceRevision + 1,
      });
    },
    [apply, setPlaying],
  );

  return {
    session,
    preview,
    update,
    remember,
    undo: () => restore('undo'),
    redo: () => restore('redo'),
    canUndo: history.undo.length > 0,
    canRedo: history.redo.length > 0,
    createSource,
    editLibrary,
    selectAnimation,
    audioError: audio.error,
    playing,
    setPlaying,
    loop,
    setLoop,
    speed,
    setSpeed,
    snap,
    setSnap,
    autoKey,
    setAutoKey,
    timelineMode,
    setTimelineMode,
    timelineZoom,
    setTimelineZoom,
    timelineScrollLeft,
    setTimelineScrollLeft,
    assets,
    onAssets: setAssets,
    ready,
    draftStatus,
    error,
  };
}

export type AnimationDocument = ReturnType<typeof useAnimationDocument>;
