import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type CSSProperties,
} from 'react';
import type { GameRuntime } from '../../game/core/GameRuntime';
import type { RtsController } from '../../game/client/RtsController';
import type { DebugOptions } from '../../game/rendering/DebugOptions';
import type { ShaderSettings } from '../../game/rendering/ShaderSettings';
import type { TerrainSmoothingSettings } from '../../game/rendering/TerrainSmoothingSettings';
import type { TerrainTextureSettings } from '../../game/rendering/TerrainTextureSettings';
import { GameCanvas } from '../../game/rendering/GameCanvas';
import {
  loadBuildingAnimationConfig,
  validateBuildingAnimationConfig,
  type BuildingAnimationBounds,
  type BuildingAnimationConfig,
  type BuildingAnimationStage,
  type BuildingAnimationTransition,
} from '../../game/buildings/BuildingAnimationConfig';
import type { BuildingAnimationPreview } from '../../game/buildings/BuildingAnimationPreview';
import { isInsideViewport, screenToWorld } from '../../game/rendering/viewport';
import { KeyframeTimeline } from './KeyframeTimeline';
import './AnimationSandbox.css';
import type { AnimationDocument } from './useAnimationDocument';
import { NumericInput, TextInput } from './EditorInput';
import {
  editAnimationValue,
  sampleAnimationStage,
  renameAnimationAsset,
  renameParticleTexture,
} from './AnimationEditing';
import { AnimationTabs } from './AnimationTabs';
import { AnimationMarkers } from './AnimationMarkers';
import { AudioTimeline } from './AudioTimeline';
import { loadBuildingAnimationLibrary } from '../../game/buildings/BuildingAnimationLibrary';
import { createDefaultBuildingTransition } from '../../game/buildings/BuildingAnimationTransitions';
import { TransitionControls } from './TransitionControls';
import {
  animationLayerEntries,
  createAnimationEffectStage,
  isImageStage,
  normalizeAnimationLayers,
  removeAnimationLayers,
  reorderAnimationLayer,
  stageTrackProperties,
  animationFilterCatalog,
  animationTextureAssets,
  type AnimationEffectPreset,
} from '../../game/buildings/BuildingAnimationEffects';
import {
  addBuiltinEffectPreset,
  applyAnimationPreset,
  builtinEffectPresets,
  captureAnimationPreset,
  changeEffectCenterSpace,
  duplicateAnimationResource,
} from './AnimationEffectEditing';
import {
  AnimationEffectControls,
  AnimationEffectPalette,
  type AddAnimationEffect,
} from './AnimationEffectControls';
import { AnimationOriginOverlay } from './AnimationOriginOverlay';
import { importAnimationImages } from './AnimationImageImport';
import { animationLibraryAssetIds } from '../../game/buildings/BuildingAnimationLibrary';

interface Props {
  runtime: GameRuntime;
  controls: RtsController;
  debug: DebugOptions;
  shaders: ShaderSettings;
  terrainSmoothing: TerrainSmoothingSettings;
  terrainTexture: TerrainTextureSettings;
  preview: BuildingAnimationPreview;
  onPreview: (preview: BuildingAnimationPreview, record?: boolean) => void;
  document: AnimationDocument;
  onOpenGame: () => void;
  onToggleTerrainDebug: (key: 'collisionMask' | 'terrainChunks' | 'terrainDirtyRects') => void;
  onPause: () => void;
  onReset: () => void;
}

function transitionsFor(stages: BuildingAnimationStage[], current: BuildingAnimationTransition[]) {
  stages = stages.filter(isImageStage);
  return stages.slice(1).map((stage, index) => {
    const from = stages[index]!;
    return (
      current.find(
        (transition) => transition.fromStageId === from.id && transition.toStageId === stage.id,
      ) ?? createDefaultBuildingTransition(from.id, stage.id)
    );
  });
}

const slug = (name: string) =>
  name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-|-$/g, '') || 'stage';

async function inspectPngAlpha(file: File): Promise<{
  file: File;
  width: number;
  height: number;
  bounds: BuildingAnimationBounds;
}> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas 2D is unavailable.');
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let minX = bitmap.width;
    let minY = bitmap.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < bitmap.height; y++) {
      for (let x = 0; x < bitmap.width; x++) {
        if (pixels[(y * bitmap.width + x) * 4 + 3]! === 0) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    return {
      file,
      width: bitmap.width,
      height: bitmap.height,
      bounds:
        maxX < minX || maxY < minY
          ? { x: 0, y: 0, width: bitmap.width, height: bitmap.height }
          : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    };
  } finally {
    bitmap.close();
  }
}

export function AnimationSandbox(props: Props) {
  const { preview, onPreview } = props;
  const activeAnimationId = props.document.preview.activeAnimationId;
  const [layerSelections, setLayerSelections] = useState<Record<string, string[]>>({});
  const selectedIds =
    layerSelections[activeAnimationId] ??
    props.document.session.view(activeAnimationId).selectedLayerIds;
  const validIndices = selectedIds
    .map((id) => preview.config.stages.findIndex((stage) => stage.id === id))
    .filter((index) => index >= 0);
  const selectedIndices = validIndices.length ? validIndices : [0];
  const setSelectedIndices = (next: number[] | ((current: number[]) => number[])) => {
    const indices = typeof next === 'function' ? next(selectedIndices) : next;
    const ids = indices.flatMap((index) =>
      preview.config.stages[index] ? [preview.config.stages[index]!.id] : [],
    );
    props.document.session.view(activeAnimationId).selectedLayerIds = ids;
    setLayerSelections((current) => ({ ...current, [activeAnimationId]: ids }));
  };
  const [timelineHeights, setTimelineHeights] = useState({ animation: 330, audio: 330, both: 400 });
  const gridRef = useRef<HTMLDivElement>(null);
  const splitterDrag = useRef<{ y: number; height: number } | null>(null);
  const { timelineMode, setTimelineMode } = props.document;
  const timelineHeight = timelineHeights[timelineMode];
  const setTimelineHeight = (value: number | ((height: number) => number)) =>
    setTimelineHeights((heights) => ({
      ...heights,
      [timelineMode]: typeof value === 'function' ? value(heights[timelineMode]) : value,
    }));
  const changeTimelineMode = setTimelineMode;
  const { playing, setPlaying, loop, setLoop, speed, setSpeed } = props.document;
  const [importError, setImportError] = useState('');
  const [placing, setPlacing] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef(preview);
  const importRevision = useRef(0);
  const [importing, setImporting] = useState(false);
  const [toolbarHidden, setToolbarHidden] = useState(false);
  const [openSettingsSections, setOpenSettingsSections] = useState<string[]>(['inspector']);
  const [showOrigins, setShowOrigins] = useState(true);
  const [presetName, setPresetName] = useState('');
  const [filterClipboard, setFilterClipboard] = useState<AnimationEffectPreset>();
  const toggleSettingsSection = (section: string) =>
    setOpenSettingsSections((current) =>
      current.includes(section)
        ? current.filter((item) => item !== section)
        : [...current, section],
    );
  const relinkRef = useRef<HTMLInputElement>(null);
  const stageList = useRef<HTMLDivElement>(null);
  const effectPalette = useRef<HTMLDivElement>(null);
  previewRef.current = preview;
  const selectedIndex = selectedIndices[selectedIndices.length - 1] ?? 0;
  const selectedId = preview.config.stages[selectedIndex]?.id;
  const isMultiSelection = selectedIndices.length > 1;
  const selectedStage = sampleAnimationStage(
    preview.config,
    preview.config.stages[selectedIndex]?.id ?? '',
    preview.progress,
  );
  const selectedLayerOrder = selectedStage?.layerOrder ?? 0;
  const orderedStageEntries = animationLayerEntries(preview.config);
  const layerSequence = orderedStageEntries
    .map(({ stage }) => `${stage.id}:${stage.layerOrder}`)
    .join('|');
  const imageStages = preview.config.stages.filter(isImageStage);
  const missingImageIndex = preview.config.stages.findIndex(
    (stage) => isImageStage(stage) && props.document.assets.failed.includes(stage.assetId),
  );
  const transitionIndex = Math.max(
    1,
    imageStages.findIndex((stage) => stage.id === selectedId),
  );
  const selectedTransition =
    selectedStage && isImageStage(selectedStage)
      ? preview.config.transitions.find(
          (transition) =>
            transition.fromStageId === imageStages[transitionIndex - 1]?.id &&
            transition.toStageId === imageStages[transitionIndex]?.id,
        )
      : undefined;
  const validation = useMemo(
    () => validateBuildingAnimationConfig(preview.config),
    [preview.config],
  );
  useEffect(() => {
    const list = stageList.current;
    const card = [...(list?.querySelectorAll<HTMLElement>('.stage-card') ?? [])].find(
      (item) => item.dataset.stageId === selectedId,
    );
    if (!list || !card) return;
    if (card.offsetTop < list.scrollTop) list.scrollTop = card.offsetTop;
    else if (card.offsetTop + card.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = card.offsetTop + card.offsetHeight - list.clientHeight;
  }, [selectedId, layerSequence]);

  useEffect(
    () => () => {
      importRevision.current++;
    },
    [],
  );
  useEffect(() => {
    if (
      preview.onionSkinStageIndex !== null &&
      preview.onionSkinStageIndex !== Math.max(0, selectedIndex - 1)
    )
      onPreview({ ...preview, onionSkinStageIndex: Math.max(0, selectedIndex - 1) });
  }, [selectedIndex, preview, onPreview]);

  useEffect(() => {
    const onSpace = (event: globalThis.KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || event.ctrlKey || event.metaKey || event.altKey)
        return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, button, [contenteditable="true"]')) return;
      event.preventDefault();
      const current = previewRef.current;
      if (
        !playing &&
        (current.progress < current.config.timeline.workAreaStart ||
          current.progress >= current.config.timeline.workAreaEnd)
      )
        onPreview({ ...current, progress: current.config.timeline.workAreaStart });
      setPlaying(!playing);
    };
    window.addEventListener('keydown', onSpace);
    return () => window.removeEventListener('keydown', onSpace);
  }, [onPreview, playing, setPlaying]);

  useEffect(() => {
    if (!placing) return;
    const cancelPlacement = (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        setPlacing(false);
        onPreview({ ...previewRef.current, opacity: 1 });
      }
    };
    window.addEventListener('keydown', cancelPlacement);
    return () => window.removeEventListener('keydown', cancelPlacement);
  }, [onPreview, placing]);

  const setConfig = (config: BuildingAnimationConfig, record = true) =>
    onPreview({ ...previewRef.current, config }, record);
  const updateConfig = (update: (config: BuildingAnimationConfig) => void, record = true) => {
    const config = structuredClone(preview.config);
    update(config);
    setConfig(config, record);
  };
  const updateStage = (patch: Partial<BuildingAnimationStage>) =>
    updateConfig((config) => {
      for (const index of selectedIndices) {
        const stage = config.stages[index];
        if (stage) {
          if (stage.locked) {
            if (patch.locked !== undefined) stage.locked = patch.locked;
            if (patch.hidden !== undefined) stage.hidden = patch.hidden;
            if (patch.solo !== undefined) stage.solo = patch.solo;
            continue;
          }
          const keyed =
            patch.scale !== undefined ? { scaleX: patch.scale, scaleY: patch.scale } : patch;
          if (patch.name !== undefined && patch.name.trim()) stage.name = patch.name.trim();
          if (patch.milestone !== undefined) stage.milestone = patch.milestone;
          if (patch.color !== undefined) stage.color = patch.color;
          if (patch.seed !== undefined) stage.seed = patch.seed;
          if (patch.enabled !== undefined) stage.enabled = patch.enabled;
          if (
            patch.coordinateSpace !== undefined &&
            patch.coordinateSpace !== stage.coordinateSpace &&
            stage.kind === 'filter' &&
            stage.parentId
          ) {
            changeEffectCenterSpace(config, stage, patch.coordinateSpace, preview.progress);
          }
          for (const property of [
            'hidden',
            'solo',
            'locked',
            'coordinateSpace',
            'particleSpace',
            'gravitySpace',
            'emissionMode',
            'endBehavior',
            'burstCount',
            'prewarmSeconds',
            'particleBudget',
            'emitterShape',
            'shapeSourceId',
            'particleTextureId',
            'spriteColumns',
            'spriteRows',
            'blendMode',
            'sizeCurve',
            'alphaCurve',
            'colorCurve',
          ] as const) {
            if (Object.hasOwn(patch, property))
              Object.assign(stage, { [property]: patch[property] });
          }
          if (patch.parentId !== undefined && stage.kind === 'filter') {
            stage.parentId = patch.parentId;
            normalizeAnimationLayers(config);
          }
          for (const property of stageTrackProperties(stage)) {
            const value = keyed[property];
            if (value === undefined) continue;
            editAnimationValue(
              config,
              stage.id,
              property,
              value,
              preview.progress,
              props.document.snap,
              props.document.autoKey,
            );
          }
        }
      }
    });
  const updateTransition = (patch: Partial<BuildingAnimationTransition>, record = true) => {
    if (!selectedTransition || selectedStage?.locked) return;
    updateConfig((config) => {
      const images = config.stages.filter(isImageStage);
      const stageIndices = isMultiSelection
        ? selectedIndices
            .map((index) => images.findIndex((stage) => stage.id === config.stages[index]?.id))
            .filter((index) => index > 0)
        : [transitionIndex];
      for (const index of stageIndices) {
        const transition = config.transitions.find(
          (candidate) =>
            candidate.fromStageId === images[index - 1]?.id &&
            candidate.toStageId === images[index]?.id,
        );
        if (transition) Object.assign(transition, patch);
      }
    }, record);
  };
  const renameAssetId = (assetId: string) => {
    if (!selectedStage || isMultiSelection) return;
    try {
      onPreview(renameAnimationAsset(preview, selectedStage.id, assetId));
      setImportError('');
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Invalid Asset ID.');
    }
  };

  const selectStage = (event: ReactMouseEvent<HTMLButtonElement>, index: number) => {
    if (event.shiftKey) {
      const order = orderedStageEntries.map((entry) => entry.index);
      const start = order.indexOf(selectedIndex);
      const end = order.indexOf(index);
      setSelectedIndices(order.slice(Math.min(start, end), Math.max(start, end) + 1));
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      setSelectedIndices((current) => {
        if (current.includes(index)) {
          const next = current.filter((selected) => selected !== index);
          return next.length ? next : [index];
        }
        return [...current, index];
      });
      return;
    }
    setSelectedIndices([index]);
  };

  const importPngs = async (files: FileList | File[] | null, mode: 'add' | 'replace' = 'add') => {
    if (!files?.length) return;
    if (!props.document.ready) return;
    const pngs = [...files].filter((file) => file.type === 'image/png');
    if (!pngs.length) {
      setImportError('Выберите файлы PNG.');
      return;
    }
    setPlaying(false);
    setImporting(true);
    const revision = ++importRevision.current;
    const initialConfig = previewRef.current.config;
    let inspected: Awaited<ReturnType<typeof inspectPngAlpha>>[];
    try {
      inspected = await Promise.all(pngs.map(inspectPngAlpha));
    } catch (error) {
      if (revision === importRevision.current)
        setImportError(error instanceof Error ? error.message : 'Unable to read PNG stages.');
      if (revision === importRevision.current) setImporting(false);
      return;
    }
    if (revision !== importRevision.current) return;
    setImporting(false);
    if (previewRef.current.config !== initialConfig) {
      setImportError('Import cancelled because the document changed. Please retry.');
      return;
    }
    const current = previewRef.current;
    const sourceUrls: Record<string, string> = { ...current.sourceUrls };
    let imported: ReturnType<typeof importAnimationImages>;
    try {
      imported = importAnimationImages(
        current.config,
        inspected.map((image) => ({ ...image, name: image.file.name })),
        activeAnimationId,
        mode,
        animationLibraryAssetIds(props.document.preview.library),
      );
    } catch (reason) {
      setImportError(reason instanceof Error ? reason.message : 'PNG import failed.');
      return;
    }
    const { config, stages } = imported;
    inspected.forEach(({ file }, index) => {
      sourceUrls[stages[index]!.assetId] = props.document.createSource(file);
    });
    const importedId = stages[0]!.id;
    props.document.session.view(activeAnimationId).selectedLayerIds = [importedId];
    setLayerSelections((selection) => ({ ...selection, [activeAnimationId]: [importedId] }));
    setImportError('');
    onPreview({
      ...current,
      config,
      sourceUrls,
      sourceRevision: current.sourceRevision + 1,
      progress: 0,
      visible: true,
    });
  };

  const moveStage = (offset: number) => {
    if (isMultiSelection || !selectedStage || selectedStage.locked) return;
    const siblings = orderedStageEntries.filter(({ stage }) =>
      selectedStage.kind === 'filter'
        ? stage.kind === 'filter' && stage.parentId === selectedStage.parentId
        : stage.kind !== 'filter',
    );
    const target =
      siblings[siblings.findIndex(({ stage }) => stage.id === selectedStage.id) + offset];
    if (!target) return;
    const config = structuredClone(preview.config);
    reorderAnimationLayer(config, selectedStage.id, target.stage.id);
    setConfig(config);
  };

  const addEffect: AddAnimationEffect = (kind, variant) => {
    const config = structuredClone(previewRef.current.config);
    const parentId = selectedStage?.kind === 'filter' ? selectedStage.parentId : selectedStage?.id;
    if (kind === 'filter' && (!parentId || isMultiSelection)) return;
    const stage = createAnimationEffectStage(
      config,
      `fx-${crypto.randomUUID()}`,
      kind,
      variant,
      kind === 'filter' ? parentId : undefined,
      preview.progress,
    );
    config.stages.push(stage);
    normalizeAnimationLayers(config);
    setPlaying(false);
    setTimelineMode('animation');
    props.document.session.view(activeAnimationId).selectedLayerIds = [stage.id];
    setLayerSelections((selection) => ({ ...selection, [activeAnimationId]: [stage.id] }));
    onPreview({ ...previewRef.current, config, visible: true });
    effectPalette.current?.hidePopover();
  };

  const applyPreset = (preset: AnimationEffectPreset | string) => {
    const config = structuredClone(previewRef.current.config);
    const parentId = selectedStage?.parentId ?? selectedId;
    const id =
      typeof preset === 'string'
        ? addBuiltinEffectPreset(config, preset, preview.progress, parentId)
        : applyAnimationPreset(config, preset, preview.progress, parentId);
    if (!id) return;
    props.document.session.view(activeAnimationId).selectedLayerIds = [id];
    setLayerSelections((selection) => ({ ...selection, [activeAnimationId]: [id] }));
    setPlaying(false);
    setTimelineMode('animation');
    setConfig(config);
  };
  const importParticleTexture = (file: File) => {
    if (!selectedId || selectedStage?.locked) return;
    const config = structuredClone(previewRef.current.config),
      stage = config.stages.find((item) => item.id === selectedId)!;
    const assetId = `particles/${crypto.randomUUID()}/${file.name}`;
    stage.particleTextureId = assetId;
    onPreview({
      ...previewRef.current,
      config,
      sourceUrls: {
        ...previewRef.current.sourceUrls,
        [assetId]: props.document.createSource(file),
      },
      sourceRevision: previewRef.current.sourceRevision + 1,
    });
  };

  const removeSelected = () => {
    if (selectedIndices.some((index) => preview.config.stages[index]?.locked)) return;
    const config = structuredClone(preview.config);
    removeAnimationLayers(
      config,
      selectedIndices.map((index) => config.stages[index]!.id),
    );
    if (!config.stages.length) return;
    const firstImage = config.stages.find(isImageStage);
    if (firstImage) firstImage.milestone = 0;
    config.transitions = transitionsFor(config.stages, config.transitions);
    setPlaying(false);
    const ids = [config.stages[0]!.id];
    props.document.session.view(activeAnimationId).selectedLayerIds = ids;
    setLayerSelections((current) => ({ ...current, [activeAnimationId]: ids }));
    setConfig(config);
  };

  const exportJson = () => {
    if (!validation.valid) return;
    const blob = new Blob([JSON.stringify(preview.config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${preview.config.id}.animation.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportEntity = () => {
    const library = props.document.preview.library;
    const blob = new Blob([JSON.stringify(library, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${slug(library.entityId)}.animations.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file?: File) => {
    if (!file || !props.document.ready) return;
    setPlaying(false);
    setImporting(true);
    const revision = ++importRevision.current;
    const initialConfig = previewRef.current.config;
    try {
      const value: unknown = JSON.parse(await file.text());
      const library =
        value && typeof value === 'object' && 'libraryVersion' in value
          ? loadBuildingAnimationLibrary(value)
          : undefined;
      const config = library ? library.animations[0]!.config : loadBuildingAnimationConfig(value);
      if (revision !== importRevision.current) return;
      if (previewRef.current.config !== initialConfig) {
        setImportError('Import cancelled because the document changed. Please retry.');
        return;
      }
      const current = previewRef.current;
      const targetId = library?.animations[0]!.id ?? activeAnimationId;
      const ids = [config.stages[0]!.id];
      props.document.session.view(targetId).selectedLayerIds = ids;
      setLayerSelections((current) => ({ ...current, [targetId]: ids }));
      setImportError('');
      if (library) {
        props.document.editLibrary(library, library.animations[0]!.id);
        return;
      }
      const sourceUrls: Record<string, string> = { ...current.sourceUrls };
      for (const stage of config.stages) {
        const url = current.sourceUrls[stage.assetId];
        if (url) sourceUrls[stage.assetId] = url;
      }
      onPreview({
        ...current,
        config,
        sourceUrls,
        progress: 0,
        visible: true,
        sourceRevision: current.sourceRevision + 1,
      });
    } catch (error) {
      if (revision === importRevision.current)
        setImportError(error instanceof Error ? error.message : 'Invalid JSON.');
    } finally {
      if (revision === importRevision.current) setImporting(false);
    }
  };

  const relinkPng = async (file?: File) => {
    if (!file || !selectedStage || file.type !== 'image/png') return;
    const stageId = selectedStage.id;
    const initialConfig = previewRef.current.config;
    const revision = ++importRevision.current;
    setImporting(true);
    try {
      await inspectPngAlpha(file);
      if (revision !== importRevision.current) return;
      const current = previewRef.current;
      if (current.config !== initialConfig)
        throw new Error('Document changed; select the PNG again.');
      const stage = current.config.stages.find((item) => item.id === stageId);
      if (!stage) return;
      onPreview({
        ...current,
        config: structuredClone(current.config),
        visible: true,
        sourceUrls: { ...current.sourceUrls, [stage.assetId]: props.document.createSource(file) },
        sourceRevision: current.sourceRevision + 1,
      });
      setImportError('');
    } catch (error) {
      if (revision === importRevision.current)
        setImportError(error instanceof Error ? error.message : 'PNG relink failed.');
    } finally {
      if (revision === importRevision.current) setImporting(false);
    }
  };

  const placementWorld = (event: ReactPointerEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const bounds = element.getBoundingClientRect();
    const screen = {
      x: ((event.clientX - bounds.left) * element.clientWidth) / Math.max(1, bounds.width),
      y: ((event.clientY - bounds.top) * element.clientHeight) / Math.max(1, bounds.height),
    };
    const viewport = props.controls.camera.getViewport(element.clientWidth, element.clientHeight);
    if (!isInsideViewport(screen, viewport)) return null;
    const world = screenToWorld(screen, viewport);
    const gameConfig = props.runtime.getConfig();
    if (
      world.x < 0 ||
      world.x >= gameConfig.world.widthMeters ||
      world.y < 0 ||
      world.y >= gameConfig.world.heightMeters
    )
      return null;
    return world;
  };

  const movePlacementGhost = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!placing) return;
    const world = placementWorld(event);
    if (!world) return;
    onPreview({ ...previewRef.current, position: world, visible: true, opacity: 0.42 });
  };

  const placeBuilding = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!placing || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const world = placementWorld(event);
    if (!world) return;
    onPreview({ ...previewRef.current, position: world, visible: true, opacity: 1 });
    setPlacing(false);
  };

  const togglePlacement = () => {
    if (placing) {
      setPlacing(false);
      onPreview({ ...preview, opacity: 1 });
      return;
    }
    setPlacing(true);
    onPreview({ ...preview, visible: true, opacity: 0.42 });
  };

  return (
    <main
      className="sandbox-workspace"
      aria-busy={importing || !props.document.ready}
      onFocusCapture={(event) => {
        if (
          (event.target as HTMLElement).matches(
            'input[type="number"], input[type="range"], input[type="color"]',
          )
        )
          setPlaying(false);
      }}
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('input, textarea, select, [contenteditable="true"], .ae-timeline'))
          return;
        if ((event.ctrlKey || event.metaKey) && (event.code === 'KeyZ' || event.code === 'KeyY')) {
          event.preventDefault();
          if (event.code === 'KeyY' || event.shiftKey) props.document.redo();
          else props.document.undo();
        }
      }}
    >
      <h1 className="sandbox-visually-hidden" id="animation-sandbox-title">
        Animation Sandbox
      </h1>
      {!toolbarHidden ? (
        <div className="sandbox-topbar" aria-label="Панель редактора анимаций">
          <details
            className="sandbox-topbar-menu sandbox-app-menu"
            onKeyDown={(event) => {
              if (event.key === 'Escape') event.currentTarget.open = false;
            }}
          >
            <summary>BALLISTICS / LAB · ANIMATION</summary>
            <div className="sandbox-topbar-popover">
              <button type="button" onClick={props.onOpenGame}>
                Открыть Game
              </button>
              <span>Animation Sandbox</span>
            </div>
          </details>
          <details
            className="sandbox-topbar-menu sandbox-file-menu"
            onKeyDown={(event) => {
              if (event.key === 'Escape') event.currentTarget.open = false;
            }}
          >
            <summary>Файл</summary>
            <div className="sandbox-topbar-popover document-actions">
              <button
                disabled={importing || !props.document.ready}
                onClick={() => importRef.current?.click()}
              >
                Import JSON
              </button>
              <button disabled={!validation.valid} onClick={exportJson}>
                Export Animation JSON
              </button>
              <button disabled={!props.document.ready} onClick={exportEntity}>
                Export Entity JSON
              </button>
              <small>JSON содержит ссылки на ресурсы. PNG и звук сохраняйте отдельно.</small>
            </div>
          </details>
          <AnimationTabs document={props.document} />
          <details
            className="sandbox-topbar-menu sandbox-status-menu"
            onKeyDown={(event) => {
              if (event.key === 'Escape') event.currentTarget.open = false;
            }}
          >
            <summary
              className={
                !validation.valid || props.document.assets.failed.length ? 'has-missing-assets' : ''
              }
            >
              {!validation.valid
                ? '● Ошибка структуры'
                : props.document.assets.failed.length
                  ? `● Нет ресурсов: ${props.document.assets.failed.length}`
                  : props.document.assets.loading
                    ? '● Загрузка ресурсов'
                    : '● Готово'}
            </summary>
            <div className="sandbox-topbar-popover document-status" role="status">
              <span>{props.document.draftStatus}</span>
              <span>Структура: {validation.valid ? 'корректна' : 'ошибка'}</span>
              <span className={props.document.assets.failed.length ? 'has-missing-assets' : ''}>
                Ресурсы: {props.document.assets.loaded.length}/
                {animationTextureAssets(preview.config).length}
                {props.document.assets.loading
                  ? ' · загрузка'
                  : props.document.assets.failed.length
                    ? ' · отсутствуют'
                    : ''}
              </span>
            </div>
          </details>
          <button
            className="sandbox-hide-toolbar"
            type="button"
            onClick={() => setToolbarHidden(true)}
            title="Скрыть верхнюю панель"
            aria-label="Скрыть верхнюю панель"
          >
            ▴
          </button>
        </div>
      ) : null}

      <div
        className="sandbox-grid"
        ref={gridRef}
        style={{ '--timeline-height': `${timelineHeight}px` } as CSSProperties}
        id="animation-editor-panel"
        role="tabpanel"
        aria-labelledby={
          toolbarHidden
            ? 'animation-sandbox-title'
            : `animation-tab-${props.document.preview.activeAnimationId}`
        }
      >
        <section className="sandbox-panel resource-panel" aria-label="Слои">
          <header className="resource-heading">
            <h2>Слои</h2>
            <span>{preview.config.stages.length}</span>
          </header>
          <div className="stage-order-label">LAYER STACK / TRANSITION</div>
          <div className="stage-list" ref={stageList}>
            {orderedStageEntries.map(({ stage, index }) => (
              <button
                className={`stage-card ${selectedIndices.includes(index) ? 'is-selected' : ''} ${stage.kind === 'filter' ? 'is-dependent' : ''} ${stage.id === selectedStage?.parentId || stage.parentId === selectedId ? 'is-related' : ''}`}
                key={stage.id}
                data-stage-id={stage.id}
                aria-pressed={selectedIndices.includes(index)}
                onClick={(event) => selectStage(event, index)}
              >
                <span className="stage-select-mark">
                  {selectedIndices.includes(index) ? '✓' : ''}
                </span>
                <span className="stage-grip">⋮⋮</span>
                <span className="stage-thumb">
                  {isImageStage(stage) ? (
                    <img
                      src={preview.sourceUrls[stage.assetId] ?? stage.assetId}
                      alt=""
                      onError={(event) => {
                        event.currentTarget.style.visibility = 'hidden';
                      }}
                      onLoad={(event) => {
                        event.currentTarget.style.visibility = 'visible';
                      }}
                    />
                  ) : (
                    <b>{stage.kind === 'filter' ? 'ƒx' : stage.kind === 'particles' ? '✦' : '☀'}</b>
                  )}
                </span>
                <span className="stage-card-copy">
                  <strong>{stage.name}</strong>
                  <small>
                    {props.document.assets.failed.includes(stage.assetId) ||
                    (stage.particleTextureId &&
                      props.document.assets.failed.includes(stage.particleTextureId)) ? (
                      <span className="missing-asset-badge">PNG отсутствует · </span>
                    ) : null}
                    {stage.kind === 'filter'
                      ? `↳ ${preview.config.stages.find((parent) => parent.id === stage.parentId)?.name}`
                      : isImageStage(stage)
                        ? `${(stage.milestone * preview.config.timeline.durationSeconds).toFixed(2)} s · ${stage.assetId}`
                        : `${stage.kind} · procedural`}
                  </small>
                </span>
              </button>
            ))}
          </div>

          <label
            className="png-drop"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void importPngs([...event.dataTransfer.files]);
            }}
          >
            <strong>＋ Добавить PNG-стадии</strong>
            <small>Сохраняет существующие слои и ключи</small>
            <input
              type="file"
              accept="image/png"
              multiple
              disabled={importing || !props.document.ready}
              onChange={(event) => {
                void importPngs(event.target.files);
                event.target.value = '';
              }}
            />
          </label>
          <button popoverTarget="animation-effect-palette" aria-haspopup="dialog">
            Добавить эффект / пресет
          </button>
          <div
            className="resource-palette"
            id="animation-effect-palette"
            popover="auto"
            ref={effectPalette}
            role="dialog"
            aria-labelledby="animation-effect-palette-title"
          >
            <header>
              <h3 id="animation-effect-palette-title">Добавить эффект / пресет</h3>
              <button
                popoverTarget="animation-effect-palette"
                popoverTargetAction="hide"
                aria-label="Закрыть палитру эффектов"
              >
                ×
              </button>
            </header>
            <AnimationEffectPalette
              onAdd={addEffect}
              canAttach={!!selectedStage && !selectedStage.locked && !isMultiSelection}
              disabled={importing || !props.document.ready}
            />
            <div className="animation-effect-presets">
              <strong>RTS PRESETS</strong>
              <div>
                {builtinEffectPresets.map((preset) => (
                  <button
                    key={preset.id}
                    disabled={
                      !props.document.ready ||
                      (['construction', 'shield'].includes(preset.id) &&
                        (!selectedStage || selectedStage.locked))
                    }
                    onClick={() => {
                      applyPreset(preset.id);
                      effectPalette.current?.hidePopover();
                    }}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
              {(preview.config.effectPresets ?? []).map((preset) => (
                <div key={preset.id}>
                  <button
                    onClick={() => {
                      applyPreset(preset);
                      effectPalette.current?.hidePopover();
                    }}
                  >
                    {preset.name}
                  </button>
                  <button
                    aria-label={`Delete preset ${preset.name}`}
                    onClick={() =>
                      updateConfig((config) => {
                        config.effectPresets = config.effectPresets?.filter(
                          (item) => item.id !== preset.id,
                        );
                      })
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
          <details className="resource-layer-actions">
            <summary>Другие действия со слоями</summary>
            <div className="stage-reorder">
              <button
                onClick={() => moveStage(-1)}
                disabled={isMultiSelection || selectedLayerOrder === 0}
              >
                ↑ Вперёд
              </button>
              <button
                onClick={() => moveStage(1)}
                disabled={
                  isMultiSelection || selectedLayerOrder === preview.config.stages.length - 1
                }
              >
                ↓ Назад
              </button>
            </div>
            <button
              onClick={removeSelected}
              disabled={
                !preview.config.stages.some(
                  (stage, index) =>
                    !selectedIndices.includes(index) &&
                    !selectedIndices.some(
                      (selected) => preview.config.stages[selected]?.id === stage.parentId,
                    ),
                )
              }
            >
              Удалить слои и их эффекты
            </button>
            <details className="resource-replace">
              <summary>Заменить набор изображений…</summary>
              <p>
                Заменяет все PNG-стадии и их ключи; сохраняет самостоятельные эффекты, звук и
                маркеры. Undo восстанавливает замену.
              </p>
              <label className="png-drop">
                Выбрать PNG для замены
                <input
                  type="file"
                  accept="image/png"
                  multiple
                  disabled={importing || !props.document.ready}
                  onChange={(event) => {
                    void importPngs(event.target.files, 'replace');
                    event.target.value = '';
                  }}
                />
              </label>
            </details>{' '}
            <details className="source-status">
              <summary>
                Ресурсы · {props.document.assets.loaded.length}/
                {animationTextureAssets(preview.config).length}
              </summary>
              <span>РЕСУРСЫ</span>
              <p>
                Импортированные PNG и звук <b>сохраняются вместе с локальным черновиком</b>
              </p>
              <p>
                JSON <strong>содержит только ссылки</strong>
              </p>
              <p role="status">
                Textures: {props.document.assets.loaded.length}/
                {animationTextureAssets(preview.config).length}
                {props.document.assets.loading
                  ? ' · loading'
                  : !preview.visible
                    ? ' · preview hidden'
                    : ''}
              </p>
              {props.document.assets.failed.length ? (
                <p role="alert">Missing: {props.document.assets.failed.join(', ')}</p>
              ) : null}
              <button
                disabled={
                  !selectedStage ||
                  !isImageStage(selectedStage) ||
                  isMultiSelection ||
                  importing ||
                  !props.document.ready
                }
                onClick={() => relinkRef.current?.click()}
              >
                Заменить PNG выбранного слоя…
              </button>
              <input
                ref={relinkRef}
                className="hidden-input"
                type="file"
                accept="image/png"
                onChange={(event) => {
                  void relinkPng(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </details>
          </details>
        </section>

        <section className="sandbox-preview sandbox-panel">
          <div className="preview-toolbar">
            {toolbarHidden ? (
              <button
                type="button"
                onClick={() => setToolbarHidden(false)}
                aria-label="Показать верхнюю панель"
              >
                ☰ Меню
              </button>
            ) : null}
            <span>
              <i /> PREVIEW / PRODUCTION RENDERER <b>LIVE</b>
            </span>
            <label>
              <input
                type="checkbox"
                checked={preview.onionSkinStageIndex !== null}
                onChange={(event) =>
                  onPreview({
                    ...preview,
                    onionSkinStageIndex: event.target.checked
                      ? Math.max(0, selectedIndex - 1)
                      : null,
                  })
                }
              />{' '}
              ONION SKIN
            </label>
            <label>
              <input
                type="checkbox"
                checked={showOrigins}
                onChange={(event) => setShowOrigins(event.target.checked)}
              />{' '}
              ORIGINS
            </label>
            <button
              onClick={() => {
                const world = props.runtime.getConfig().world;
                props.controls.camera.moveTo(
                  preview.position ?? { x: world.widthMeters / 2, y: world.heightMeters / 2 },
                );
                onPreview({ ...preview, visible: true });
              }}
            >
              Focus building
            </button>
          </div>
          <div className="sandbox-game-frame">
            <GameCanvas
              allowFireHotkey={false}
              runtime={props.runtime}
              controls={props.controls}
              debug={props.debug}
              shaders={props.shaders}
              terrainSmoothing={props.terrainSmoothing}
              terrainTexture={props.terrainTexture}
              buildingPreview={preview}
              onBuildingAssets={props.document.onAssets}
              onToggleTerrainDebug={props.onToggleTerrainDebug}
              onPause={props.onPause}
              onReset={props.onReset}
            />
            <AnimationOriginOverlay
              preview={preview}
              runtime={props.runtime}
              controls={props.controls}
              selectedId={selectedId}
              placing={placing}
              visible={showOrigins}
              snap={props.document.snap}
              autoKey={props.document.autoKey}
              onSelect={(index) => setSelectedIndices([index])}
              onPause={() => setPlaying(false)}
              onRemember={props.document.remember}
              onConfig={(config) => setConfig(config, false)}
            />
            <div
              className={`building-placement-layer ${placing ? 'is-active' : ''}`}
              onPointerMove={movePlacementGhost}
              onPointerDown={placeBuilding}
              aria-label="Выберите точку размещения тестового здания"
            >
              {placing ? <span>CLICK TO PLACE · ESC CANCEL</span> : null}
            </div>
            <output className="preview-progress">PROGRESS {preview.progress.toFixed(3)}</output>
            {!preview.visible ||
            props.document.assets.failed.length > 0 ||
            props.document.assets.loading ? (
              <div className="preview-empty-state" role="status">
                {!preview.visible ? (
                  'Загрузите PNG-стадии или нажмите Spawn Test Building.'
                ) : props.document.assets.loading ? (
                  'Загрузка изображений…'
                ) : (
                  <>
                    <span>
                      Отсутствуют текстуры: {props.document.assets.failed.length}. Проверьте ресурсы
                      слоёв.
                    </span>
                    {missingImageIndex >= 0 ? (
                      <button
                        disabled={importing || !props.document.ready}
                        onClick={() => {
                          const index =
                            selectedStage &&
                            isImageStage(selectedStage) &&
                            props.document.assets.failed.includes(selectedStage.assetId)
                              ? selectedIndex
                              : missingImageIndex;
                          if (index >= 0) {
                            setSelectedIndices([index]);
                            relinkRef.current?.click();
                          }
                        }}
                      >
                        Восстановить PNG…
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </div>
          <div className="preview-meta">
            <span>REAL CAMERA · TERRAIN · WORLD SCALE</span>
            <div className="preview-placement-values">
              <span>
                X <b>{preview.position?.x.toFixed(2) ?? 'AUTO'}</b> · Y{' '}
                <b>{preview.position?.y.toFixed(2) ?? 'TERRAIN'}</b>
              </span>
            </div>
          </div>
          <div className="preview-actions">
            {' '}
            <button className={placing ? 'is-placing' : ''} onClick={togglePlacement}>
              {placing ? 'Cancel Placement' : 'Spawn Test Building'}
            </button>
            <button
              onClick={() => {
                onPreview({
                  ...preview,
                  progress: preview.config.timeline.workAreaStart,
                  visible: true,
                });
                setPlaying(true);
              }}
            >
              Restart Animation
            </button>
            <button
              className="danger"
              onClick={() => {
                setPlaying(false);
                onPreview({ ...preview, visible: false });
              }}
            >
              Remove Test Building
            </button>
            <button
              className="cyan"
              onClick={() => {
                onPreview({
                  ...preview,
                  visible: true,
                  progress:
                    preview.progress >= preview.config.timeline.workAreaEnd
                      ? preview.config.timeline.workAreaStart
                      : preview.progress,
                });
                setPlaying(true);
                props.onOpenGame();
              }}
            >
              Test In Game
            </button>
          </div>
        </section>

        <aside className="sandbox-panel inspector-panel" onFocusCapture={() => setPlaying(false)}>
          <div className="inspector-content">
            <div className="entity-settings">
              {selectedStage ? (
                <>
                  <CollapsibleSection
                    className="inspector-section"
                    heading="СВОЙСТВА СЛОЯ"
                    open={openSettingsSections.includes('inspector')}
                    onToggle={() => toggleSettingsSection('inspector')}
                    subheading={
                      isMultiSelection
                        ? `${selectedIndices.length} stages selected`
                        : selectedStage.name
                    }
                  >
                    <div className="entity-layer-controls">
                      {(['hidden', 'solo', 'locked'] as const).map((flag) => (
                        <button
                          key={flag}
                          aria-pressed={selectedStage[flag] === true}
                          onClick={() => updateStage({ [flag]: !selectedStage[flag] })}
                        >
                          {flag === 'hidden' ? 'Hidden' : flag === 'solo' ? 'Solo' : 'Locked'}
                        </button>
                      ))}
                      <details className="layer-operations">
                        <summary>Действия и пресеты…</summary>
                        <div>
                          {' '}
                          <button
                            disabled={
                              isMultiSelection ||
                              isImageStage(selectedStage) ||
                              selectedStage.locked
                            }
                            onClick={() => {
                              const config = structuredClone(preview.config),
                                id = duplicateAnimationResource(config, selectedStage.id);
                              if (id) {
                                setConfig(config);
                                props.document.session.view(activeAnimationId).selectedLayerIds = [
                                  id,
                                ];
                                setLayerSelections((selection) => ({
                                  ...selection,
                                  [activeAnimationId]: [id],
                                }));
                              }
                            }}
                          >
                            Duplicate
                          </button>
                          <button
                            onClick={() => {
                              const root = selectedStage.parentId ?? selectedStage.id,
                                preset = captureAnimationPreset(preview.config, root, 'Filters');
                              if (preset) {
                                const parent = preset.stages.find(
                                  (item) => item.kind !== 'filter',
                                )!;
                                parent.kind = 'image';
                                parent.assetId = `stack/${parent.id}`;
                                preset.tracks = preset.tracks.filter(
                                  (track) => track.stageId !== parent.id,
                                );
                                setFilterClipboard(preset);
                              }
                            }}
                          >
                            Copy filters
                          </button>
                          <button
                            disabled={!filterClipboard || selectedStage.locked}
                            onClick={() => applyPreset(filterClipboard!)}
                          >
                            Paste filters
                          </button>
                          <TextInput
                            value={presetName}
                            label="Preset name"
                            onCommit={setPresetName}
                          />
                          <button
                            disabled={(preview.config.effectPresets?.length ?? 0) >= 100}
                            onClick={() => {
                              const preset = captureAnimationPreset(
                                preview.config,
                                selectedStage.parentId ?? selectedStage.id,
                                presetName || selectedStage.name,
                              );
                              if (preset)
                                updateConfig((config) => {
                                  config.effectPresets = [...(config.effectPresets ?? []), preset];
                                });
                            }}
                          >
                            Save preset
                          </button>
                        </div>
                      </details>{' '}
                    </div>
                    <fieldset className="entity-editable-fields" disabled={selectedStage.locked}>
                      <p className="sampled-value-note">
                        {preview.config.tracks.some((track) => track.stageId === selectedId)
                          ? 'Значения на текущем кадре · изменение анимируемого свойства записывает ключ'
                          : 'Базовые значения · AUTO-KEY создаёт анимацию свойства'}
                      </p>
                      {isMultiSelection ? (
                        <span className="multi-selection-note">
                          TRANSFORM VALUES APPLY TO ALL SELECTED FRAMES
                        </span>
                      ) : null}
                      <label>
                        NAME
                        <TextInput
                          value={selectedStage.name}
                          disabled={isMultiSelection}
                          onCommit={(value) => updateStage({ name: value })}
                        />
                      </label>
                      {isImageStage(selectedStage) ? (
                        <label>
                          ASSET ID
                          <TextInput
                            value={selectedStage.assetId}
                            disabled={isMultiSelection}
                            onCommit={renameAssetId}
                          />
                        </label>
                      ) : null}
                      <div className="field-grid two">
                        {selectedStage.kind !== 'filter' ||
                        animationFilterCatalog[selectedStage.filterType!]?.center ? (
                          <PairedNumberField
                            label="POSITION X, Y · px"
                            first={selectedStage.x}
                            second={selectedStage.y}
                            onFirst={(x) => updateStage({ x })}
                            onSecond={(y) => updateStage({ y })}
                          />
                        ) : null}
                        {selectedStage.kind !== 'filter' ? (
                          <>
                            <PairedNumberField
                              label="SCALE X, Y"
                              min={0.001}
                              first={selectedStage.scaleX}
                              second={selectedStage.scaleY}
                              step={0.01}
                              onFirst={(scaleX) => updateStage({ scaleX })}
                              onSecond={(scaleY) => updateStage({ scaleY })}
                            />
                            <label>
                              ROTATION · °
                              <NumericInput
                                step={0.01}
                                value={selectedStage.rotation}
                                onCommit={(value) => updateStage({ rotation: value })}
                              />
                            </label>
                          </>
                        ) : null}
                        <label>
                          {selectedStage.kind === 'filter' ? 'MIX' : 'OPACITY'}
                          <NumericInput
                            min={0}
                            max={1}
                            step={0.01}
                            value={selectedStage.opacity}
                            onCommit={(value) => updateStage({ opacity: value })}
                          />
                        </label>
                        {isImageStage(selectedStage) ? (
                          <label>
                            ПОЯВЛЕНИЕ · s
                            <NumericInput
                              min={0}
                              max={preview.config.timeline.durationSeconds}
                              step={1 / preview.config.timeline.frameRate}
                              value={
                                selectedStage.milestone * preview.config.timeline.durationSeconds
                              }
                              disabled={isMultiSelection || selectedId === imageStages[0]?.id}
                              onCommit={(value) =>
                                updateStage({
                                  milestone: value / preview.config.timeline.durationSeconds,
                                })
                              }
                            />
                          </label>
                        ) : null}
                      </div>
                      {!isImageStage(selectedStage) && !isMultiSelection ? (
                        <AnimationEffectControls
                          stage={selectedStage}
                          config={preview.config}
                          progress={preview.progress}
                          onPatch={(patch) => {
                            if (Object.hasOwn(patch, 'particleTextureId') && selectedId)
                              onPreview(
                                renameParticleTexture(
                                  previewRef.current,
                                  selectedId,
                                  patch.particleTextureId,
                                ),
                              );
                            else updateStage(patch);
                          }}
                          onTexture={importParticleTexture}
                        />
                      ) : null}
                      {selectedStage.kind !== 'filter' ? (
                        <details className="advanced-transform">
                          <summary>Pivot и Skew · дополнительные трансформации</summary>
                          <div className="field-grid two">
                            {' '}
                            <PairedNumberField
                              label="SKEW X, Y · °"
                              first={selectedStage.skewX}
                              second={selectedStage.skewY}
                              step={0.01}
                              onFirst={(skewX) => updateStage({ skewX })}
                              onSecond={(skewY) => updateStage({ skewY })}
                            />
                            <PairedNumberField
                              label="PIVOT X, Y · px"
                              first={selectedStage.pivotX}
                              second={selectedStage.pivotY}
                              step={0.01}
                              onFirst={(pivotX) => updateStage({ pivotX })}
                              onSecond={(pivotY) => updateStage({ pivotY })}
                            />
                          </div>
                        </details>
                      ) : null}
                    </fieldset>
                  </CollapsibleSection>
                  <CollapsibleSection
                    className="inspector-section canvas-fields"
                    heading="АНИМАЦИЯ · ГЕОМЕТРИЯ"
                    open={openSettingsSections.includes('canvas')}
                    onToggle={() => toggleSettingsSection('canvas')}
                  >
                    <label>
                      CONFIG ID · SCHEMA v{preview.config.schemaVersion}
                      <TextInput
                        label="Animation config ID"
                        value={preview.config.id}
                        onCommit={(value) => {
                          if (value.trim())
                            updateConfig((config) => {
                              config.id = value.trim();
                            });
                        }}
                      />
                    </label>
                    <div className="field-grid two">
                      <label>
                        WORLD WIDTH{' '}
                        <NumericInput
                          min={0.5}
                          step={0.1}
                          value={preview.config.worldSize.widthMeters}
                          onCommit={(value) =>
                            updateConfig((config) => (config.worldSize.widthMeters = value))
                          }
                        />{' '}
                        m
                      </label>
                      <label>
                        WORLD HEIGHT{' '}
                        <NumericInput
                          min={0.5}
                          step={0.1}
                          value={preview.config.worldSize.heightMeters}
                          onCommit={(value) =>
                            updateConfig((config) => (config.worldSize.heightMeters = value))
                          }
                        />{' '}
                        m
                      </label>

                      <label>
                        W · px
                        <NumericInput
                          value={preview.config.canvas.width}
                          min={1}
                          onCommit={(value) =>
                            updateConfig((config) => (config.canvas.width = value))
                          }
                        />
                      </label>
                      <label>
                        H · px
                        <NumericInput
                          value={preview.config.canvas.height}
                          min={1}
                          onCommit={(value) =>
                            updateConfig((config) => (config.canvas.height = value))
                          }
                        />
                      </label>
                      <PairedNumberField
                        label="ORIGIN X, Y · px"
                        first={preview.config.origin.x}
                        second={preview.config.origin.y}
                        onFirst={(x) => updateConfig((config) => (config.origin.x = x))}
                        onSecond={(y) => updateConfig((config) => (config.origin.y = y))}
                      />
                    </div>
                  </CollapsibleSection>
                  <CollapsibleSection
                    className="inspector-section hitbox-fields"
                    heading="ТЕХНИЧЕСКИЕ · HITBOX"
                    open={openSettingsSections.includes('hitbox')}
                    onToggle={() => toggleSettingsSection('hitbox')}
                  >
                    <label className="inline-check">
                      <input
                        type="checkbox"
                        checked={preview.showHitbox}
                        onChange={(event) =>
                          onPreview({ ...preview, showHitbox: event.target.checked })
                        }
                      />
                      SHOW IN PREVIEW
                    </label>
                    <div className="field-grid two">
                      <PairedNumberField
                        label="POSITION X, Y · px"
                        first={preview.config.hitbox.x}
                        second={preview.config.hitbox.y}
                        onFirst={(x) => updateConfig((config) => (config.hitbox.x = x))}
                        onSecond={(y) => updateConfig((config) => (config.hitbox.y = y))}
                      />
                      <label>
                        W
                        <NumericInput
                          min={1}
                          value={preview.config.hitbox.width}
                          onCommit={(value) =>
                            updateConfig((config) => (config.hitbox.width = value))
                          }
                        />
                      </label>
                      <label>
                        H · px
                        <NumericInput
                          min={1}
                          value={preview.config.hitbox.height}
                          onCommit={(value) =>
                            updateConfig((config) => (config.hitbox.height = value))
                          }
                        />
                      </label>
                    </div>
                    <PairedNumberField
                      label="SCALE X, Y"
                      first={preview.config.hitbox.scaleX}
                      second={preview.config.hitbox.scaleY}
                      min={0.05}
                      step={0.05}
                      onFirst={(x) => updateConfig((config) => (config.hitbox.scaleX = x))}
                      onSecond={(y) => updateConfig((config) => (config.hitbox.scaleY = y))}
                    />
                    <button
                      className="inspector-reset"
                      onClick={() =>
                        updateConfig((config) => {
                          config.hitbox = { ...config.alphaBounds, scaleX: 1, scaleY: 1 };
                        })
                      }
                    >
                      Reset to alpha bounds
                    </button>
                  </CollapsibleSection>
                  <CollapsibleSection
                    className="inspector-section optimization-fields"
                    heading="ТЕХНИЧЕСКИЕ · ТЕКСТУРЫ"
                    open={openSettingsSections.includes('texture')}
                    onToggle={() => toggleSettingsSection('texture')}
                  >
                    <label>
                      SAMPLING
                      <select
                        value={preview.config.textureOptimization.scaleMode}
                        onChange={(event) =>
                          updateConfig(
                            (config) =>
                              (config.textureOptimization.scaleMode = event.target
                                .value as BuildingAnimationConfig['textureOptimization']['scaleMode']),
                          )
                        }
                      >
                        <option value="linear">Linear / smooth</option>
                        <option value="nearest">Nearest / pixel art</option>
                      </select>
                    </label>
                    <label className="inline-check">
                      <input
                        type="checkbox"
                        checked={preview.config.textureOptimization.mipmaps}
                        onChange={(event) =>
                          updateConfig(
                            (config) => (config.textureOptimization.mipmaps = event.target.checked),
                          )
                        }
                      />
                      GENERATE MIPMAPS
                    </label>
                    <label>
                      ANISOTROPY
                      <select
                        value={preview.config.textureOptimization.anisotropy}
                        onChange={(event) =>
                          updateConfig(
                            (config) =>
                              (config.textureOptimization.anisotropy = Number(
                                event.target.value,
                              ) as BuildingAnimationConfig['textureOptimization']['anisotropy']),
                          )
                        }
                      >
                        {[1, 2, 4, 8, 16].map((value) => (
                          <option key={value} value={value}>
                            {value}×
                          </option>
                        ))}
                      </select>
                    </label>
                    <small>Mipmaps + Linear уменьшают зернистость при сильном уменьшении.</small>
                  </CollapsibleSection>
                </>
              ) : null}
              {selectedTransition ? (
                <CollapsibleSection
                  className="inspector-section transition-fields"
                  heading={`ПЕРЕХОД · ${imageStages[transitionIndex - 1]?.name} → ${imageStages[transitionIndex]?.name}`}
                  open={openSettingsSections.includes('transition')}
                  onToggle={() => toggleSettingsSection('transition')}
                >
                  {isMultiSelection ? (
                    <span className="multi-selection-note">
                      APPLIES TO EACH SELECTED FRAME'S INCOMING TRANSITION
                    </span>
                  ) : null}
                  <TransitionControls
                    transition={selectedTransition}
                    onRemember={props.document.remember}
                    onChange={(patch, record) => {
                      setPlaying(false);
                      updateTransition(patch, record);
                    }}
                    progress={
                      (preview.progress - imageStages[transitionIndex - 1]!.milestone) /
                      (imageStages[transitionIndex]!.milestone -
                        imageStages[transitionIndex - 1]!.milestone)
                    }
                    onProgress={(amount) => {
                      setPlaying(false);
                      const start = imageStages[transitionIndex - 1]!.milestone;
                      const end = imageStages[transitionIndex]!.milestone;
                      onPreview(
                        { ...preview, progress: start + (end - start) * amount, visible: true },
                        false,
                      );
                    }}
                  />
                </CollapsibleSection>
              ) : null}
            </div>
            <div className={`validation-box ${validation.valid ? 'is-valid' : 'is-invalid'}`}>
              <span>
                Структура <b>● {validation.valid ? 'КОРРЕКТНА' : 'ОШИБКА'}</b>
              </span>
              <p>
                {importError ||
                  props.document.error ||
                  (importing ? 'Reading import…' : '') ||
                  (validation.valid
                    ? `${preview.config.stages.length} stages · ${preview.config.tracks.reduce((count, track) => count + track.keys.length, 0)} keys · ${preview.config.timeline.durationSeconds}s @ ${preview.config.timeline.frameRate} fps`
                    : validation.errors[0])}
              </p>
            </div>
          </div>
        </aside>

        <div
          className="timeline-splitter"
          role="separator"
          tabIndex={0}
          aria-label="Высота таймлайна"
          aria-orientation="horizontal"
          aria-valuemin={240}
          aria-valuemax={Math.max(240, (gridRef.current?.clientHeight ?? 700) - 170)}
          aria-valuenow={Math.min(
            timelineHeight,
            Math.max(240, (gridRef.current?.clientHeight ?? 700) - 170),
          )}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            splitterDrag.current = {
              y: event.clientY,
              height:
                event.currentTarget.nextElementSibling?.getBoundingClientRect().height ??
                timelineHeight,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const drag = splitterDrag.current;
            if (drag)
              setTimelineHeight(
                Math.max(
                  240,
                  Math.min(
                    (gridRef.current?.clientHeight ?? 700) - 170,
                    drag.height - (event.clientY - drag.y),
                  ),
                ),
              );
          }}
          onPointerUp={() => {
            splitterDrag.current = null;
          }}
          onLostPointerCapture={() => {
            splitterDrag.current = null;
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              setTimelineHeight((height) =>
                Math.max(
                  240,
                  Math.min(
                    (gridRef.current?.clientHeight ?? 700) - 170,
                    Math.min(height, (gridRef.current?.clientHeight ?? 700) - 170) +
                      (event.key === 'ArrowUp' ? 20 : -20),
                  ),
                ),
              );
            }
          }}
        />
        <section className="sandbox-timeline sandbox-panel">
          <div className="timeline-mode-bar">
            <div
              role="tablist"
              aria-label="Режим таймлайна"
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const modes = ['animation', 'audio', 'both'] as const;
                const index = modes.indexOf(timelineMode);
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? 2
                      : (index + (event.key === 'ArrowLeft' ? -1 : 1) + 3) % 3;
                changeTimelineMode(modes[next]!);
                const tabs =
                  event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
                tabs[next]?.focus();
              }}
            >
              <button
                role="tab"
                id="timeline-tab-animation"
                tabIndex={timelineMode === 'animation' ? 0 : -1}
                aria-selected={timelineMode === 'animation'}
                aria-controls="animation-timeline-panel"
                onClick={() => changeTimelineMode('animation')}
              >
                Анимация
              </button>
              <button
                role="tab"
                id="timeline-tab-audio"
                tabIndex={timelineMode === 'audio' ? 0 : -1}
                aria-selected={timelineMode === 'audio'}
                aria-controls="audio-timeline-panel"
                onClick={() => changeTimelineMode('audio')}
              >
                Звук <small>{preview.config.sounds.length}</small>
              </button>
              <button
                role="tab"
                id="timeline-tab-both"
                aria-selected={timelineMode === 'both'}
                tabIndex={timelineMode === 'both' ? 0 : -1}
                aria-controls="animation-timeline-panel audio-timeline-panel"
                onClick={() => changeTimelineMode('both')}
              >
                Анимация + звук
              </button>
            </div>
            <span>
              {
                props.document.preview.library.animations.find(
                  (entry) => entry.id === props.document.preview.activeAnimationId,
                )?.name
              }{' '}
              · {preview.config.timeline.frameRate} fps
            </span>
          </div>
          <AnimationMarkers
            key={props.document.preview.activeAnimationId}
            document={props.document}
          />
          <div className={`timeline-panels ${timelineMode === 'both' ? 'is-combined' : ''}`}>
            <div
              className="timeline-mode-panel"
              id="animation-timeline-panel"
              role="tabpanel"
              aria-labelledby="timeline-tab-animation"
              hidden={timelineMode === 'audio'}
              inert={timelineMode === 'audio'}
            >
              <KeyframeTimeline
                zoom={props.document.timelineZoom}
                onZoom={props.document.setTimelineZoom}
                linkedScroll={
                  timelineMode === 'both' ? props.document.timelineScrollLeft : undefined
                }
                onScroll={props.document.setTimelineScrollLeft}
                key={props.document.preview.activeAnimationId}
                session={props.document.session}
                animationId={activeAnimationId}
                config={preview.config}
                stage={selectedStage}
                progress={preview.progress}
                playing={playing}
                loop={loop}
                speed={speed}
                snap={props.document.snap}
                onSnap={props.document.setSnap}
                autoKey={props.document.autoKey}
                onAutoKey={props.document.setAutoKey}
                onRemember={props.document.remember}
                onUndo={props.document.undo}
                onRedo={props.document.redo}
                canUndo={props.document.canUndo}
                canRedo={props.document.canRedo}
                onConfig={(config, progress) =>
                  onPreview({ ...preview, config, progress: progress ?? preview.progress }, false)
                }
                onProgress={(progress) => {
                  setPlaying(false);
                  onPreview({ ...preview, progress, visible: true });
                }}
                onSelectStage={(index) => setSelectedIndices([index])}
                onPlaying={setPlaying}
                onLoop={setLoop}
                onSpeed={setSpeed}
              />
            </div>
            <div
              className="timeline-mode-panel"
              id="audio-timeline-panel"
              role="tabpanel"
              aria-labelledby="timeline-tab-audio"
              hidden={timelineMode === 'animation'}
              inert={timelineMode === 'animation'}
            >
              <AudioTimeline
                key={props.document.preview.activeAnimationId}
                document={props.document}
                compact={timelineMode === 'both'}
              />
            </div>
          </div>
          <input
            ref={importRef}
            className="hidden-input"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              void importJson(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </section>
      </div>
    </main>
  );
}

function CollapsibleSection({
  className,
  heading,
  subheading,
  children,
  open,
  onToggle,
}: {
  className: string;
  heading: string;
  subheading?: string;
  children: ReactNode;
  open: boolean;
  onToggle: () => void;
}) {
  const contentId = useId();
  return (
    <section className={`collapsible-block ${className} ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="collapsible-heading"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={onToggle}
      >
        <span className="collapsible-heading-copy">
          <span>{heading}</span>
          {subheading ? <strong>{subheading}</strong> : null}
        </span>
        <span className="collapsible-chevron" aria-hidden="true">
          ▸
        </span>
      </button>
      <div className="collapsible-content" id={contentId} aria-hidden={!open} inert={!open}>
        <div className="collapsible-content-inner">
          <div className="collapsible-fields">{children}</div>
        </div>
      </div>
    </section>
  );
}

function PairedNumberField({
  label,
  first,
  second,
  onFirst,
  onSecond,
  min,
  step,
}: {
  label: string;
  first: number;
  second: number;
  onFirst: (value: number) => void;
  onSecond: (value: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <div className="paired-number-field">
      <span>{label}</span>
      <div>
        <NumericInput
          label={`${label} X`}
          value={first}
          min={min}
          step={step}
          onCommit={(value) => onFirst(value)}
        />
        <span aria-hidden="true">,</span>
        <NumericInput
          label={`${label} Y`}
          value={second}
          min={min}
          step={step}
          onCommit={(value) => onSecond(value)}
        />
      </div>
    </div>
  );
}
