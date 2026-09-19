import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { GameRuntime } from '../../game/core/GameRuntime';
import type { RtsController } from '../../game/client/RtsController';
import type { DebugOptions } from '../../game/rendering/DebugOptions';
import type { ShaderSettings } from '../../game/rendering/ShaderSettings';
import type { TerrainSmoothingSettings } from '../../game/rendering/TerrainSmoothingSettings';
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
import './AnimationSandbox.css';

interface Props {
  runtime: GameRuntime;
  controls: RtsController;
  debug: DebugOptions;
  shaders: ShaderSettings;
  terrainSmoothing: TerrainSmoothingSettings;
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
  previewRef.current = preview;
  const selectedIndex = selectedIndices[selectedIndices.length - 1] ?? 0;
  const isMultiSelection = selectedIndices.length > 1;
  const selectedStage = preview.config.stages[selectedIndex];
  const selectedTransition =
    selectedIndex > 0
      ? preview.config.transitions[selectedIndex - 1]
      : preview.config.transitions[0];
  const validation = validateBuildingAnimationConfig(preview.config);

  useEffect(() => {
    if (!playing) return;
    const tick = (now: number) => {
      const elapsed = lastTimeRef.current ? (now - lastTimeRef.current) / 1000 : 0;
      lastTimeRef.current = now;
      const current = previewRef.current;
      const next = current.progress + elapsed * speed * 0.25;
      if (next >= 1) {
        if (loop) onPreview({ ...current, progress: 0 });
        else {
          onPreview({ ...current, progress: 1 });
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
      for (const index of selectedIndices) {
        const stage = config.stages[index];
        if (stage) Object.assign(stage, patch);
      }
    });
  const updateTransition = (patch: Partial<BuildingAnimationTransition>) => {
    if (!selectedTransition) return;
    updateConfig((config) => {
      const transitionIndices = isMultiSelection
        ? selectedIndices.filter((index) => index > 0).map((index) => index - 1)
        : [Math.max(0, selectedIndex - 1)];
      for (const index of transitionIndices) {
        const transition = config.transitions[index];
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
      const start = Math.min(selectedIndex, index);
      const end = Math.max(selectedIndex, index);
      setSelectedIndices(Array.from({ length: end - start + 1 }, (_, offset) => start + offset));
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
    const inspected = await Promise.all(pngs.map(inspectPngAlpha));
    const sourceUrls = { ...preview.sourceUrls };
    const stages = inspected.map(({ file }, index) => {
      const base = slug(file.name);
      const assetId = `buildings/${base}.png`;
      if (sourceUrls[assetId]?.startsWith('blob:')) URL.revokeObjectURL(sourceUrls[assetId]);
      sourceUrls[assetId] = URL.createObjectURL(file);
      return {
        id: `stage-${base}-${index + 1}`,
        name: file.name.replace(/\.[^.]+$/, ''),
        assetId,
        milestone: pngs.length === 1 ? 0 : Number(((index / (pngs.length - 1)) * 0.85).toFixed(3)),
        x: 0,
        y: 0,
        scale: 1,
      };
    });
    const config = structuredClone(preview.config);
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
    config.transitions = transitionsFor(stages, config.transitions);
    setSelectedIndices([0]);
    onPreview({
      ...preview,
      config,
      sourceUrls,
      sourceRevision: preview.sourceRevision + 1,
      progress: 0,
      visible: true,
    });
  };

  const moveStage = (offset: number) => {
    if (isMultiSelection) return;
    const target = selectedIndex + offset;
    if (target < 0 || target >= preview.config.stages.length) return;
    const config = structuredClone(preview.config);
    const [stage] = config.stages.splice(selectedIndex, 1);
    if (!stage) return;
    config.stages.splice(target, 0, stage);
    config.transitions = transitionsFor(config.stages, config.transitions);
    setSelectedIndices([target]);
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
    try {
      const config = loadBuildingAnimationConfig(JSON.parse(await file.text()));
      setSelectedIndices([0]);
      setImportError('');
      onPreview({ ...preview, config, progress: 0, sourceRevision: preview.sourceRevision + 1 });
    } catch (error) {
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
        <aside className="sandbox-panel stage-panel">
          <div className="sandbox-panel-heading">
            <div>
              <span>STAGES</span>
              <h2>Build sequence</h2>
            </div>
            <b>{String(preview.config.stages.length).padStart(2, '0')}</b>
          </div>
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
          <div className="stage-order-label">ORDER / MILESTONE</div>
          <div className="stage-list">
            {preview.config.stages.map((stage, index) => (
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
              disabled={isMultiSelection || selectedIndex === 0}
            >
              ↑ Earlier
            </button>
            <button
              onClick={() => moveStage(1)}
              disabled={isMultiSelection || selectedIndex === preview.config.stages.length - 1}
            >
              ↓ Later
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
        </aside>

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
              runtime={props.runtime}
              controls={props.controls}
              debug={props.debug}
              shaders={props.shaders}
              terrainSmoothing={props.terrainSmoothing}
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
          <div className="sandbox-panel-heading">
            <div>
              <span>INSPECTOR</span>
              <h2>
                {isMultiSelection
                  ? `${selectedIndices.length} stages selected`
                  : (selectedStage?.name ?? 'No stage')}
              </h2>
            </div>
            <b>⌁</b>
          </div>
          {selectedStage ? (
            <>
              <div className="inspector-section">
                {isMultiSelection ? (
                  <span className="multi-selection-note">
                    X / Y / SCALE APPLY TO ALL SELECTED FRAMES
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
                <div className="field-grid four">
                  <label>
                    X
                    <input
                      type="number"
                      value={selectedStage.x}
                      onChange={(event) => updateStage({ x: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    Y
                    <input
                      type="number"
                      value={selectedStage.y}
                      onChange={(event) => updateStage({ y: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    SCALE
                    <input
                      type="number"
                      step="0.01"
                      value={selectedStage.scale}
                      onChange={(event) => updateStage({ scale: Number(event.target.value) })}
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
              </div>
              <div className="inspector-section canvas-fields">
                <span>CANVAS / ORIGIN</span>
                <div className="field-grid four">
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
                  <label>
                    OX
                    <input
                      type="number"
                      value={preview.config.origin.x}
                      onChange={(event) =>
                        updateConfig((config) => (config.origin.x = Number(event.target.value)))
                      }
                    />
                  </label>
                  <label>
                    OY
                    <input
                      type="number"
                      value={preview.config.origin.y}
                      onChange={(event) =>
                        updateConfig((config) => (config.origin.y = Number(event.target.value)))
                      }
                    />
                  </label>
                </div>
              </div>
              <div className="inspector-section hitbox-fields">
                <span>HITBOX / ALPHA BOUNDS</span>
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
                <div className="field-grid four">
                  <label>
                    X
                    <input
                      type="number"
                      value={preview.config.hitbox.x}
                      onChange={(event) =>
                        updateConfig((config) => (config.hitbox.x = Number(event.target.value)))
                      }
                    />
                  </label>
                  <label>
                    Y
                    <input
                      type="number"
                      value={preview.config.hitbox.y}
                      onChange={(event) =>
                        updateConfig((config) => (config.hitbox.y = Number(event.target.value)))
                      }
                    />
                  </label>
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
                <div className="field-grid two">
                  <label>
                    SCALE X
                    <input
                      type="number"
                      min="0.05"
                      step="0.05"
                      value={preview.config.hitbox.scaleX}
                      onChange={(event) =>
                        updateConfig(
                          (config) => (config.hitbox.scaleX = Number(event.target.value)),
                        )
                      }
                    />
                  </label>
                  <label>
                    SCALE Y
                    <input
                      type="number"
                      min="0.05"
                      step="0.05"
                      value={preview.config.hitbox.scaleY}
                      onChange={(event) =>
                        updateConfig(
                          (config) => (config.hitbox.scaleY = Number(event.target.value)),
                        )
                      }
                    />
                  </label>
                </div>
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
              </div>
              <div className="inspector-section optimization-fields">
                <span>TEXTURE / STRONG DOWNSCALE</span>
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
              </div>
            </>
          ) : null}
          {selectedTransition ? (
            <div className="inspector-section transition-fields">
              <span>
                TRANSITION / {selectedTransition.fromStageId} → {selectedTransition.toStageId}
              </span>
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
            </div>
          ) : null}
          <div className={`validation-box ${validation.valid ? 'is-valid' : 'is-invalid'}`}>
            <span>
              VALIDATION <b>● {validation.valid ? 'PASS' : 'BLOCKED'}</b>
            </span>
            <p>
              {importError ||
                (validation.valid
                  ? `${preview.config.stages.length} stages · ${preview.config.transitions.length} transitions · Object URLs excluded`
                  : validation.errors[0])}
            </p>
          </div>
        </aside>
      </div>

      <section className="sandbox-timeline sandbox-panel">
        <div className="timeline-row">
          <span className="timeline-label">
            TIMELINE<b>BUILD_SEQUENCE</b>
          </span>
          <div className="timeline-track">
            {preview.config.stages.map((stage) => (
              <i
                key={stage.id}
                style={{ left: `${stage.milestone * 100}%` }}
                title={`${stage.name}: ${stage.milestone}`}
              />
            ))}
            <em style={{ left: `${preview.progress * 100}%` }} />
          </div>
          <button onClick={() => setPlaying((value) => !value)}>
            {playing ? 'Ⅱ PAUSE' : '▶ PLAY'}
          </button>
          <label>
            <input
              type="checkbox"
              checked={loop}
              onChange={(event) => setLoop(event.target.checked)}
            />{' '}
            LOOP
          </label>
          <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
            <option value={0.25}>0.25×</option>
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={4}>4×</option>
          </select>
        </div>
        <input
          className="progress-scrubber"
          type="range"
          min="0"
          max="1"
          step="0.001"
          value={preview.progress}
          onChange={(event) => {
            setPlaying(false);
            onPreview({ ...preview, progress: Number(event.target.value), visible: true });
          }}
        />
        <div className="timeline-actions">
          <span>
            PROGRESS <b>{preview.progress.toFixed(3)}</b>
          </span>
          <div>
            <button className={placing ? 'is-placing' : ''} onClick={togglePlacement}>
              {placing ? 'Cancel Placement' : 'Spawn Test Building'}
            </button>
            <button
              onClick={() => {
                onPreview({ ...preview, progress: 0, visible: true });
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
    </main>
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
