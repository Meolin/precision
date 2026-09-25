import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
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
  type BuildingAnimationTrackProperty,
} from '../../game/buildings/BuildingAnimationConfig';
import type { BuildingAnimationPreview } from '../../game/buildings/BuildingAnimationPreview';
import { isInsideViewport, screenToWorld } from '../../game/rendering/viewport';
import { KeyframeTimeline } from './KeyframeTimeline';
import './AnimationSandbox.css';

interface Props {
  runtime: GameRuntime;
  controls: RtsController;
  debug: DebugOptions;
  shaders: ShaderSettings;
  terrainSmoothing: TerrainSmoothingSettings;
  terrainTexture: TerrainTextureSettings;
  preview: BuildingAnimationPreview;
  onPreview: (preview: BuildingAnimationPreview) => void;
  onOpenGame: () => void;
  onToggleTerrainDebug: (key: 'collisionMask' | 'terrainChunks' | 'terrainDirtyRects') => void;
  onPause: () => void;
  onReset: () => void;
}

const transitionDefaults = (
  fromStageId: string,
  toStageId: string,
): BuildingAnimationTransition => ({
  fromStageId,
  toStageId,
  type: 'dissolve',
  direction: 'bottom-to-top',
  noiseScale: 8,
  directionStrength: 0.68,
  edgeWidth: 0.08,
  edgeIntensity: 1,
  edgeColor: '#85d7e8',
  easing: 'ease-out',
  blendMode: 'normal',
});

function transitionsFor(stages: BuildingAnimationStage[], current: BuildingAnimationTransition[]) {
  return stages.slice(1).map((stage, index) => {
    const from = stages[index]!;
    return (
      current.find(
        (transition) => transition.fromStageId === from.id && transition.toStageId === stage.id,
      ) ?? transitionDefaults(from.id, stage.id)
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
  const [selectedIndices, setSelectedIndices] = useState<number[]>([0]);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [importError, setImportError] = useState('');
  const [placing, setPlacing] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const previewRef = useRef(preview);
  const importRevision = useRef(0);
  previewRef.current = preview;
  const selectedIndex = selectedIndices[selectedIndices.length - 1] ?? 0;
  const isMultiSelection = selectedIndices.length > 1;
  const selectedStage = preview.config.stages[selectedIndex];
  const selectedLayerOrder = selectedStage?.layerOrder ?? 0;
  const orderedStageEntries = preview.config.stages
    .map((stage, index) => ({ stage, index }))
    .sort((left, right) => left.stage.layerOrder - right.stage.layerOrder);
  const selectedTransition =
    selectedIndex > 0
      ? preview.config.transitions.find(
          (transition) =>
            transition.fromStageId === preview.config.stages[selectedIndex - 1]?.id &&
            transition.toStageId === selectedStage?.id,
        )
      : preview.config.transitions[0];
  const validation = validateBuildingAnimationConfig(preview.config);

  useEffect(() => {
    if (!playing) return;
    const tick = (now: number) => {
      const elapsed = lastTimeRef.current ? (now - lastTimeRef.current) / 1000 : 0;
      lastTimeRef.current = now;
      const current = previewRef.current;
      const timeline = current.config.timeline;
      const next = current.progress + (elapsed * speed) / timeline.durationSeconds;
      if (next >= timeline.workAreaEnd) {
        if (loop) onPreview({ ...current, progress: timeline.workAreaStart });
        else {
          onPreview({ ...current, progress: timeline.workAreaEnd });
          setPlaying(false);
        }
      } else onPreview({ ...current, progress: next });
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      lastTimeRef.current = 0;
    };
  }, [loop, onPreview, playing, speed]);

  useEffect(() => {
    const onSpace = (event: globalThis.KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || event.ctrlKey || event.metaKey || event.altKey)
        return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
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
  }, [onPreview, playing]);

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

  const setConfig = (config: BuildingAnimationConfig) => onPreview({ ...preview, config });
  const updateConfig = (update: (config: BuildingAnimationConfig) => void) => {
    const config = structuredClone(preview.config);
    update(config);
    setConfig(config);
  };
  const updateStage = (patch: Partial<BuildingAnimationStage>) =>
    updateConfig((config) => {
      const time = Math.min(
        1,
        Math.max(
          0,
          Math.round(
            preview.progress * config.timeline.durationSeconds * config.timeline.frameRate,
          ) /
            (config.timeline.durationSeconds * config.timeline.frameRate),
        ),
      );
      for (const index of selectedIndices) {
        const stage = config.stages[index];
        if (stage) {
          Object.assign(stage, patch);
          if (patch.scale !== undefined) {
            stage.scaleX = patch.scale;
            stage.scaleY = patch.scale;
          }
          const keyed =
            patch.scale !== undefined ? { scaleX: stage.scaleX, scaleY: stage.scaleY } : patch;
          for (const property of [
            'x',
            'y',
            'scaleX',
            'scaleY',
            'rotation',
            'opacity',
            'skewX',
            'skewY',
            'pivotX',
            'pivotY',
          ] as BuildingAnimationTrackProperty[]) {
            const value = keyed[property];
            if (value === undefined) continue;
            let track = config.tracks.find(
              (candidate) => candidate.stageId === stage.id && candidate.property === property,
            );
            if (!track) {
              track = { stageId: stage.id, property, keys: [] };
              config.tracks.push(track);
            }
            const existing = track.keys.find((key) => Math.abs(key.time - time) < 0.00001);
            if (existing) existing.value = value;
            else {
              track.keys.push({
                id: `key-${crypto.randomUUID()}`,
                time,
                value,
                interpolation: 'linear',
                bezier: [0.4, 0, 0.2, 1],
              });
              track.keys.sort((left, right) => left.time - right.time);
            }
          }
        }
      }
    });
  const updateTransition = (patch: Partial<BuildingAnimationTransition>) => {
    if (!selectedTransition) return;
    updateConfig((config) => {
      const stageIndices = isMultiSelection
        ? selectedIndices.filter((index) => index > 0)
        : [Math.max(1, selectedIndex)];
      for (const index of stageIndices) {
        const transition = config.transitions.find(
          (candidate) =>
            candidate.fromStageId === config.stages[index - 1]?.id &&
            candidate.toStageId === config.stages[index]?.id,
        );
        if (transition) Object.assign(transition, patch);
      }
    });
  };
  const renameAssetId = (assetId: string) => {
    if (!selectedStage || isMultiSelection) return;
    const sourceUrls = { ...preview.sourceUrls };
    const localUrl = sourceUrls[selectedStage.assetId];
    if (localUrl) {
      delete sourceUrls[selectedStage.assetId];
      sourceUrls[assetId] = localUrl;
    }
    const config = structuredClone(preview.config);
    const stage = config.stages[selectedIndex];
    if (stage) stage.assetId = assetId;
    onPreview({
      ...preview,
      config,
      sourceUrls,
      sourceRevision: preview.sourceRevision + (localUrl ? 1 : 0),
    });
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

  const importPngs = async (files: FileList | null) => {
    if (!files?.length) return;
    const pngs = [...files].filter((file) => file.type === 'image/png');
    if (!pngs.length) return;
    if (pngs.length < 2) {
      setImportError('Select at least two PNG stages.');
      return;
    }
    const revision = ++importRevision.current;
    const initialConfig = previewRef.current.config;
    let inspected: Awaited<ReturnType<typeof inspectPngAlpha>>[];
    try {
      inspected = await Promise.all(pngs.map(inspectPngAlpha));
    } catch (error) {
      if (revision === importRevision.current)
        setImportError(error instanceof Error ? error.message : 'Unable to read PNG stages.');
      return;
    }
    if (revision !== importRevision.current || previewRef.current.config !== initialConfig) return;
    const current = previewRef.current;
    const sourceUrls = { ...current.sourceUrls };
    const usedAssetIds = new Set<string>();
    const stages = inspected.map(({ file }, index) => {
      const base = slug(file.name);
      let assetId = `buildings/${base}.png`;
      let suffix = 2;
      while (usedAssetIds.has(assetId)) assetId = `buildings/${base}-${suffix++}.png`;
      usedAssetIds.add(assetId);
      const previousUrl = sourceUrls[assetId];
      if (previousUrl?.startsWith('blob:')) URL.revokeObjectURL(previousUrl);
      sourceUrls[assetId] = URL.createObjectURL(file);
      return {
        id: `stage-${base}-${index + 1}`,
        name: file.name,
        assetId,
        milestone: pngs.length === 1 ? 0 : Number(((index / (pngs.length - 1)) * 0.85).toFixed(3)),
        inPoint: 0,
        outPoint: 1,
        layerOrder: pngs.length - 1 - index,
        x: 0,
        y: 0,
        scale: 1,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
        skewX: 0,
        skewY: 0,
        pivotX: 0,
        pivotY: 0,
      };
    });
    for (const [index, stage] of stages.entries()) {
      stage.inPoint = stages[index - 1]?.milestone ?? 0;
      stage.outPoint = stages[index + 1]?.milestone ?? 1;
    }
    const config = structuredClone(current.config);
    const finalImage = inspected[inspected.length - 1]!;
    const alphaBounds = finalImage.bounds;
    const widthMeters = config.worldSize.widthMeters;
    config.canvas = { width: finalImage.width, height: finalImage.height };
    config.alphaBounds = { ...alphaBounds };
    config.hitbox = { ...alphaBounds, scaleX: 1, scaleY: 1 };
    config.origin = {
      x: alphaBounds.x + alphaBounds.width / 2,
      y: alphaBounds.y + alphaBounds.height,
    };
    config.worldSize = {
      widthMeters,
      heightMeters: widthMeters * (alphaBounds.height / alphaBounds.width),
    };
    config.stages = stages;
    config.tracks = [];
    config.transitions = transitionsFor(stages, config.transitions);
    setSelectedIndices([0]);
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
    if (isMultiSelection) return;
    const targetOrder = selectedLayerOrder + offset;
    if (targetOrder < 0 || targetOrder >= preview.config.stages.length) return;
    const config = structuredClone(preview.config);
    const stage = config.stages[selectedIndex];
    const other = config.stages.find((candidate) => candidate.layerOrder === targetOrder);
    if (!stage || !other) return;
    other.layerOrder = stage.layerOrder;
    stage.layerOrder = targetOrder;
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

  const importJson = async (file?: File) => {
    if (!file) return;
    const revision = ++importRevision.current;
    const initialConfig = previewRef.current.config;
    try {
      const config = loadBuildingAnimationConfig(JSON.parse(await file.text()));
      if (revision !== importRevision.current || previewRef.current.config !== initialConfig)
        return;
      const current = previewRef.current;
      setSelectedIndices([0]);
      setImportError('');
      onPreview({ ...current, config, progress: 0, sourceRevision: current.sourceRevision + 1 });
    } catch (error) {
      if (revision === importRevision.current)
        setImportError(error instanceof Error ? error.message : 'Invalid JSON.');
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
    <main className="sandbox-workspace">
      <div className="sandbox-title-row">
        <div>
          <span className="eyebrow">DEVELOPER TOOL / RENDER PIPELINE</span>
          <h1>Animation Sandbox</h1>
          <p>Сборка стадий материализации через production BuildingAnimationPlayer.</p>
        </div>
        <label className="sandbox-id-field">
          SCHEMA <b>v{preview.config.schemaVersion}</b>
          <span>
            CONFIG
            <input
              value={preview.config.id}
              onChange={(event) => updateConfig((config) => (config.id = event.target.value))}
            />
          </span>
        </label>
      </div>

      <div className="sandbox-grid">
        <section className="sandbox-preview sandbox-panel">
          <div className="preview-toolbar">
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
              onToggleTerrainDebug={props.onToggleTerrainDebug}
              onPause={props.onPause}
              onReset={props.onReset}
            />
            <div
              className={`building-placement-layer ${placing ? 'is-active' : ''}`}
              onPointerMove={movePlacementGhost}
              onPointerDown={placeBuilding}
              aria-label="Выберите точку размещения тестового здания"
            >
              {placing ? <span>CLICK TO PLACE · ESC CANCEL</span> : null}
            </div>
            <div className="preview-origin">ORIGIN / TERRAIN CONTACT</div>
            <output className="preview-progress">PROGRESS {preview.progress.toFixed(3)}</output>
          </div>
          <div className="preview-meta">
            <span>REAL CAMERA · TERRAIN · WORLD SCALE</span>
            <div className="preview-placement-values">
              <span>
                X <b>{preview.position?.x.toFixed(2) ?? 'AUTO'}</b> · Y{' '}
                <b>{preview.position?.y.toFixed(2) ?? 'TERRAIN'}</b>
              </span>
              <label>
                WIDTH{' '}
                <input
                  type="number"
                  min="0.5"
                  step="0.1"
                  value={preview.config.worldSize.widthMeters}
                  onChange={(event) =>
                    updateConfig(
                      (config) => (config.worldSize.widthMeters = Number(event.target.value)),
                    )
                  }
                />{' '}
                m
              </label>
              <label>
                HEIGHT{' '}
                <input
                  type="number"
                  min="0.5"
                  step="0.1"
                  value={preview.config.worldSize.heightMeters}
                  onChange={(event) =>
                    updateConfig(
                      (config) => (config.worldSize.heightMeters = Number(event.target.value)),
                    )
                  }
                />{' '}
                m
              </label>
            </div>
          </div>
        </section>

        <aside className="sandbox-panel inspector-panel">
          <CollapsibleSection
            className="inspector-stages"
            heading="STAGES"
            subheading={`Layers / sequence · ${String(preview.config.stages.length).padStart(2, '0')}`}
          >
            <label className="png-drop">
              <strong>＋ Drop / browse PNG stages</strong>
              <small>multiple files · local preview only</small>
              <input
                type="file"
                accept="image/png"
                multiple
                onChange={(event) => void importPngs(event.target.files)}
              />
            </label>
            <div className="stage-order-label">LAYER STACK / TRANSITION</div>
            <div className="stage-list">
              {orderedStageEntries.map(({ stage, index }) => (
                <button
                  className={`stage-card ${selectedIndices.includes(index) ? 'is-selected' : ''}`}
                  key={stage.id}
                  onClick={(event) => selectStage(event, index)}
                >
                  <span className="stage-select-mark">
                    {selectedIndices.includes(index) ? '✓' : ''}
                  </span>
                  <span className="stage-grip">⋮⋮</span>
                  <span className="stage-thumb">
                    {preview.sourceUrls[stage.assetId] ? (
                      <img src={preview.sourceUrls[stage.assetId]} alt="" />
                    ) : (
                      <i />
                    )}
                  </span>
                  <span className="stage-card-copy">
                    <strong>{stage.name}</strong>
                    <small>
                      {stage.milestone.toFixed(2)} · {stage.assetId}
                    </small>
                  </span>
                </button>
              ))}
            </div>
            <div className="stage-reorder">
              <button
                onClick={() => moveStage(-1)}
                disabled={isMultiSelection || selectedLayerOrder === 0}
              >
                ↑ Front
              </button>
              <button
                onClick={() => moveStage(1)}
                disabled={
                  isMultiSelection || selectedLayerOrder === preview.config.stages.length - 1
                }
              >
                ↓ Back
              </button>
            </div>
            <div className="source-status">
              <span>SOURCE STATUS</span>
              <p>
                Object URL <b>local-only</b>
              </p>
              <p>
                Asset IDs <strong>exportable</strong>
              </p>
            </div>
          </CollapsibleSection>
          {selectedStage ? (
            <>
              <CollapsibleSection
                className="inspector-section"
                heading="INSPECTOR"
                subheading={
                  isMultiSelection
                    ? `${selectedIndices.length} stages selected`
                    : selectedStage.name
                }
              >
                {isMultiSelection ? (
                  <span className="multi-selection-note">
                    TRANSFORM VALUES APPLY TO ALL SELECTED FRAMES
                  </span>
                ) : null}
                <label>
                  NAME
                  <input
                    value={selectedStage.name}
                    disabled={isMultiSelection}
                    onChange={(event) => updateStage({ name: event.target.value })}
                  />
                </label>
                <label>
                  ASSET ID
                  <input
                    value={selectedStage.assetId}
                    disabled={isMultiSelection}
                    onChange={(event) => renameAssetId(event.target.value)}
                  />
                </label>
                <div className="field-grid two">
                  <PairedNumberField
                    label="POSITION X, Y"
                    first={selectedStage.x}
                    second={selectedStage.y}
                    onFirst={(x) => updateStage({ x })}
                    onSecond={(y) => updateStage({ y })}
                  />
                  <PairedNumberField
                    label="SCALE X, Y"
                    first={selectedStage.scaleX}
                    second={selectedStage.scaleY}
                    step={0.01}
                    onFirst={(scaleX) => updateStage({ scaleX })}
                    onSecond={(scaleY) => updateStage({ scaleY })}
                  />
                  <PairedNumberField
                    label="SKEW X, Y"
                    first={selectedStage.skewX}
                    second={selectedStage.skewY}
                    step={0.01}
                    onFirst={(skewX) => updateStage({ skewX })}
                    onSecond={(skewY) => updateStage({ skewY })}
                  />
                  <PairedNumberField
                    label="PIVOT X, Y"
                    first={selectedStage.pivotX}
                    second={selectedStage.pivotY}
                    step={0.01}
                    onFirst={(pivotX) => updateStage({ pivotX })}
                    onSecond={(pivotY) => updateStage({ pivotY })}
                  />
                  <label>
                    ROTATION
                    <input
                      type="number"
                      step="0.01"
                      value={selectedStage.rotation}
                      onChange={(event) => updateStage({ rotation: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    OPACITY
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={selectedStage.opacity}
                      onChange={(event) => updateStage({ opacity: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    MILESTONE
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={selectedStage.milestone}
                      disabled={isMultiSelection}
                      onChange={(event) => updateStage({ milestone: Number(event.target.value) })}
                    />
                  </label>
                </div>
              </CollapsibleSection>
              <CollapsibleSection
                className="inspector-section canvas-fields"
                heading="CANVAS / ORIGIN"
              >
                <div className="field-grid two">
                  <label>
                    W
                    <input
                      type="number"
                      value={preview.config.canvas.width}
                      onChange={(event) =>
                        updateConfig((config) => (config.canvas.width = Number(event.target.value)))
                      }
                    />
                  </label>
                  <label>
                    H
                    <input
                      type="number"
                      value={preview.config.canvas.height}
                      onChange={(event) =>
                        updateConfig(
                          (config) => (config.canvas.height = Number(event.target.value)),
                        )
                      }
                    />
                  </label>
                  <PairedNumberField
                    label="ORIGIN X, Y"
                    first={preview.config.origin.x}
                    second={preview.config.origin.y}
                    onFirst={(x) => updateConfig((config) => (config.origin.x = x))}
                    onSecond={(y) => updateConfig((config) => (config.origin.y = y))}
                  />
                </div>
              </CollapsibleSection>
              <CollapsibleSection
                className="inspector-section hitbox-fields"
                heading="HITBOX / ALPHA BOUNDS"
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
                    label="POSITION X, Y"
                    first={preview.config.hitbox.x}
                    second={preview.config.hitbox.y}
                    onFirst={(x) => updateConfig((config) => (config.hitbox.x = x))}
                    onSecond={(y) => updateConfig((config) => (config.hitbox.y = y))}
                  />
                  <label>
                    W
                    <input
                      type="number"
                      min="1"
                      value={preview.config.hitbox.width}
                      onChange={(event) =>
                        updateConfig((config) => (config.hitbox.width = Number(event.target.value)))
                      }
                    />
                  </label>
                  <label>
                    H
                    <input
                      type="number"
                      min="1"
                      value={preview.config.hitbox.height}
                      onChange={(event) =>
                        updateConfig(
                          (config) => (config.hitbox.height = Number(event.target.value)),
                        )
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
                heading="TEXTURE / STRONG DOWNSCALE"
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
              heading={`TRANSITION / ${selectedTransition.fromStageId} → ${selectedTransition.toStageId}`}
            >
              {isMultiSelection ? (
                <span className="multi-selection-note">
                  APPLIES TO EACH SELECTED FRAME'S INCOMING TRANSITION
                </span>
              ) : null}
              <label>
                TYPE
                <select
                  value={selectedTransition.type}
                  onChange={(event) =>
                    updateTransition({
                      type: event.target.value as BuildingAnimationTransition['type'],
                    })
                  }
                >
                  <option value="crossfade">Crossfade</option>
                  <option value="reveal">Reveal</option>
                  <option value="dissolve">Dissolve</option>
                </select>
              </label>
              <label>
                DIRECTION
                <select
                  value={selectedTransition.direction}
                  onChange={(event) =>
                    updateTransition({
                      direction: event.target.value as BuildingAnimationTransition['direction'],
                    })
                  }
                >
                  <option value="uniform">Uniform</option>
                  <option value="bottom-to-top">Bottom to top</option>
                  <option value="top-to-bottom">Top to bottom</option>
                  <option value="center-out">Center out</option>
                </select>
              </label>
              <Range
                label="NOISE SCALE"
                value={selectedTransition.noiseScale}
                min={1}
                max={24}
                step={0.1}
                onChange={(noiseScale) => updateTransition({ noiseScale })}
              />
              <Range
                label="DIRECTION STRENGTH"
                value={selectedTransition.directionStrength}
                min={0}
                max={1}
                step={0.01}
                onChange={(directionStrength) => updateTransition({ directionStrength })}
              />
              <Range
                label="EDGE WIDTH"
                value={selectedTransition.edgeWidth}
                min={0.001}
                max={0.3}
                step={0.001}
                onChange={(edgeWidth) => updateTransition({ edgeWidth })}
              />
              <Range
                label="EDGE INTENSITY"
                value={selectedTransition.edgeIntensity}
                min={0}
                max={2}
                step={0.01}
                onChange={(edgeIntensity) => updateTransition({ edgeIntensity })}
              />
              <label>
                EDGE COLOR
                <input
                  type="color"
                  value={selectedTransition.edgeColor}
                  onChange={(event) => updateTransition({ edgeColor: event.target.value })}
                />
              </label>
              <label>
                EASING
                <select
                  value={selectedTransition.easing}
                  onChange={(event) =>
                    updateTransition({
                      easing: event.target.value as BuildingAnimationTransition['easing'],
                    })
                  }
                >
                  <option value="linear">Linear</option>
                  <option value="ease-in">Ease in</option>
                  <option value="ease-out">Ease out</option>
                  <option value="ease-in-out">Ease in/out</option>
                </select>
              </label>
              {selectedTransition.type === 'dissolve' ? (
                <label>
                  EDGE BLEND MODE
                  <select
                    value={selectedTransition.blendMode}
                    onChange={(event) =>
                      updateTransition({
                        blendMode: event.target.value as BuildingAnimationTransition['blendMode'],
                      })
                    }
                  >
                    <option value="normal">Normal</option>
                    <option value="add">Add</option>
                    <option value="screen">Screen</option>
                    <option value="multiply">Multiply</option>
                    <option value="overlay">Overlay</option>
                  </select>
                </label>
              ) : null}
            </CollapsibleSection>
          ) : null}
          <div className={`validation-box ${validation.valid ? 'is-valid' : 'is-invalid'}`}>
            <span>
              VALIDATION <b>● {validation.valid ? 'PASS' : 'BLOCKED'}</b>
            </span>
            <p>
              {importError ||
                (validation.valid
                  ? `${preview.config.stages.length} stages · ${preview.config.tracks.reduce((count, track) => count + track.keys.length, 0)} keys · ${preview.config.timeline.durationSeconds}s @ ${preview.config.timeline.frameRate} fps · Object URLs excluded`
                  : validation.errors[0])}
            </p>
          </div>
        </aside>

        <section className="sandbox-timeline sandbox-panel">
          <KeyframeTimeline
            config={preview.config}
            stage={selectedStage}
            progress={preview.progress}
            playing={playing}
            loop={loop}
            speed={speed}
            onConfig={(config, progress) =>
              onPreview({ ...preview, config, progress: progress ?? preview.progress })
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
          <div className="timeline-actions">
            <span>
              TIME{' '}
              <b>{(preview.progress * preview.config.timeline.durationSeconds).toFixed(2)} s</b>
            </span>
            <div>
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
                Restart Build
              </button>
              <button className="danger" onClick={() => onPreview({ ...preview, visible: false })}>
                Remove Test Building
              </button>
              <button
                className="cyan"
                onClick={() => {
                  onPreview({ ...preview, visible: true });
                  props.onOpenGame();
                }}
              >
                Test In Game
              </button>
              <button onClick={() => importRef.current?.click()}>Import JSON</button>
              <button className="primary" disabled={!validation.valid} onClick={exportJson}>
                Export Animation JSON
              </button>
            </div>
          </div>
          <input
            ref={importRef}
            className="hidden-input"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void importJson(event.target.files?.[0])}
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
}: {
  className: string;
  heading: string;
  subheading?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  return (
    <section className={`collapsible-block ${className} ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="collapsible-heading"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((current) => !current)}
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
        <input
          type="number"
          aria-label={`${label} first value`}
          value={first}
          min={min}
          step={step}
          onChange={(event) => onFirst(Number(event.target.value))}
        />
        <span aria-hidden="true">,</span>
        <input
          type="number"
          aria-label={`${label} second value`}
          value={second}
          min={min}
          step={step}
          onChange={(event) => onSecond(Number(event.target.value))}
        />
      </div>
    </div>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="range-field">
      <span>
        {label}
        <b>{value.toFixed(step < 0.01 ? 3 : 2)}</b>
      </span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
