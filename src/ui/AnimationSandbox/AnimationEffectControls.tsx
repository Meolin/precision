import { useMemo } from 'react';
import type {
  BuildingAnimationConfig,
  BuildingAnimationStage,
} from '../../game/buildings/BuildingAnimationConfig';
import {
  animationFilterCatalog,
  effectParameter,
  effectProperties,
  isImageStage,
  type AnimationFilterType,
  type AnimationMediaKind,
  type AnimationParticlePreset,
  type ParticleCurvePoint,
  type AnimationEffectProperty,
} from '../../game/buildings/BuildingAnimationEffects';
import {
  animationStageVisible,
  createParticlePlan,
  liveParticleBirths,
} from '../../game/buildings/BuildingAnimationParticles';
import { animationResourceEnabled } from '../../game/buildings/BuildingAnimationTransform';
import { NumericInput, TextInput } from './EditorInput';

export type AddAnimationEffect = (
  kind: Exclude<AnimationMediaKind, 'image'>,
  variant?: AnimationParticlePreset | AnimationFilterType,
) => void;
export function AnimationEffectPalette({
  onAdd,
  canAttach,
  disabled,
}: {
  onAdd: AddAnimationEffect;
  canAttach: boolean;
  disabled: boolean;
}) {
  return (
    <div className="animation-effect-palette">
      <strong>PROCEDURAL MEDIA</strong>
      <div>
        {(['sparks', 'smoke', 'embers'] as const).map((preset) => (
          <button key={preset} disabled={disabled} onClick={() => onAdd('particles', preset)}>
            ＋ {preset}
          </button>
        ))}
        <button disabled={disabled} onClick={() => onAdd('light')}>
          ＋ Aura
        </button>
        <button disabled={disabled} onClick={() => onAdd('ring')}>
          ＋ Ring
        </button>
      </div>
      <strong>ATTACH TO SELECTED RESOURCE</strong>
      <div>
        {(Object.keys(animationFilterCatalog) as AnimationFilterType[]).map((type) => (
          <button
            key={type}
            disabled={disabled || !canAttach}
            onClick={() => onAdd('filter', type)}
          >
            ＋ {animationFilterCatalog[type].label}
          </button>
        ))}
      </div>
      <small>Фильтры добавляются под ресурсом в порядке их применения.</small>
    </div>
  );
}
function CurveEditor({
  label,
  curve,
  max,
  onChange,
}: {
  label: string;
  curve: ParticleCurvePoint[];
  max: number;
  onChange: (points: ParticleCurvePoint[]) => void;
}) {
  return (
    <div className="particle-curve-editor">
      <strong>{label} · AGE 0…1</strong>
      <svg
        className="particle-life-curve"
        viewBox="0 0 200 64"
        role="img"
        aria-label={`${label}: изменение за жизнь частицы`}
      >
        <path d="M0 63H200 M1 0V64" fill="none" stroke="currentColor" opacity="0.3" />
        <polyline
          points={curve
            .map(
              (point) =>
                `${point.age * 198 + 1},${63 - (point.value / Math.max(1, ...curve.map((item) => item.value))) * 60}`,
            )
            .join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
      {curve.map((point, index) => (
        <div key={index} className="particle-curve-point">
          <NumericInput
            label={`${label} age ${index}`}
            value={point.age}
            min={index ? curve[index - 1]!.age + 0.001 : 0}
            max={index < curve.length - 1 ? curve[index + 1]!.age - 0.001 : 1}
            step={0.05}
            disabled={index === 0 || index === curve.length - 1}
            onCommit={(age) =>
              onChange(curve.map((item, i) => (i === index ? { ...item, age } : item)))
            }
          />
          <NumericInput
            label={`${label} value ${index}`}
            min={0}
            max={max}
            step={0.05}
            value={point.value}
            onCommit={(value) =>
              onChange(curve.map((item, i) => (i === index ? { ...item, value } : item)))
            }
          />
          <button
            disabled={index === 0 || index === curve.length - 1}
            onClick={() => onChange(curve.filter((_, i) => i !== index))}
            aria-label={`Remove ${label} point ${index}`}
          >
            ×
          </button>
        </div>
      ))}
      <button
        disabled={curve.length >= 16}
        onClick={() => {
          let index = 1;
          for (let i = 2; i < curve.length; i++)
            if (curve[i]!.age - curve[i - 1]!.age > curve[index]!.age - curve[index - 1]!.age)
              index = i;
          const a = curve[index - 1]!,
            b = curve[index]!;
          onChange([
            ...curve.slice(0, index),
            { age: (a.age + b.age) / 2, value: (a.value + b.value) / 2 },
            ...curve.slice(index),
          ]);
        }}
      >
        ＋ point
      </button>
    </div>
  );
}
export function AnimationEffectControls({
  stage,
  config,
  progress,
  onPatch,
  onTexture,
}: {
  stage: BuildingAnimationStage;
  config: BuildingAnimationConfig;
  progress: number;
  onPatch: (patch: Partial<BuildingAnimationStage>) => void;
  onTexture: (file: File) => void;
}) {
  const plan = useMemo(() => {
    const resource = config.stages.find((item) => item.id === stage.id);
    return resource?.kind === 'particles' ? createParticlePlan(config, resource) : undefined;
  }, [config, stage.id]);
  const seconds = progress * config.timeline.durationSeconds;
  const live = plan ? liveParticleBirths(plan, seconds) : [];
  const visible =
    progress >= stage.inPoint &&
    animationResourceEnabled(config, stage) &&
    (stage.emitterShape !== 'contour' || !!stage.shapeSourceId) &&
    (stage.endBehavior !== 'cut' || animationStageVisible(stage, progress)) &&
    (stage.endBehavior !== 'fade' ||
      seconds < stage.outPoint * config.timeline.durationSeconds + 0.5);
  const color = `#${[stage.fxRed ?? 255, stage.fxGreen ?? 180, stage.fxBlue ?? 84].map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
  const fields = (properties: AnimationEffectProperty[]) => (
    <div className="field-grid two">
      {properties.map((property) => {
        const parameter = effectParameter(stage, property);
        return (
          <label key={property}>
            {parameter.label}
            <NumericInput
              label={parameter.label}
              value={stage[property] ?? parameter.value}
              min={parameter.min}
              max={parameter.max}
              step={parameter.step}
              onCommit={(value) => onPatch({ [property]: value })}
            />
          </label>
        );
      })}
    </div>
  );
  return (
    <div className="animation-effect-controls">
      <label>
        <input
          type="checkbox"
          checked={stage.enabled !== false}
          onChange={(event) => onPatch({ enabled: event.target.checked })}
        />{' '}
        ENABLED
      </label>
      {stage.kind === 'filter' ? (
        <>
          <label>
            ATTACHED RESOURCE
            <select
              value={stage.parentId}
              onChange={(event) => onPatch({ parentId: event.target.value })}
            >
              {config.stages
                .filter((resource) => resource.kind !== 'filter')
                .map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.name}
                  </option>
                ))}
            </select>
          </label>
          {animationFilterCatalog[stage.filterType!]?.center ? (
            <label>
              CENTER SPACE
              <select
                value={stage.coordinateSpace ?? 'composition'}
                onChange={(event) =>
                  onPatch({
                    coordinateSpace: event.target
                      .value as BuildingAnimationStage['coordinateSpace'],
                  })
                }
              >
                <option value="composition">Composition</option>
                <option value="local">Resource local</option>
              </select>
            </label>
          ) : null}
        </>
      ) : (
        <label>
          BLEND
          <select
            value={stage.blendMode ?? 'add'}
            onChange={(event) =>
              onPatch({ blendMode: event.target.value as BuildingAnimationStage['blendMode'] })
            }
          >
            {['normal', 'add', 'screen', 'multiply'].map((mode) => (
              <option key={mode}>{mode}</option>
            ))}
          </select>
        </label>
      )}
      {effectProperties(stage).includes('fxRed') ? (
        <label>
          COLOR · RGB KEYFRAMES
          <input
            type="color"
            value={color}
            onChange={(event) => {
              const color = event.target.value,
                value = parseInt(color.slice(1), 16);
              onPatch({
                color,
                fxRed: value >> 16,
                fxGreen: (value >> 8) & 255,
                fxBlue: value & 255,
              });
            }}
          />
        </label>
      ) : null}
      {stage.kind === 'particles' ? (
        <>
          <details className="effect-settings-group" open>
            <summary>Эмиссия</summary>
            <div className="effect-group-content">
              <label>
                EMISSION
                <select
                  value={stage.emissionMode ?? 'continuous'}
                  onChange={(event) =>
                    onPatch({
                      emissionMode: event.target.value as BuildingAnimationStage['emissionMode'],
                    })
                  }
                >
                  <option value="continuous">Continuous</option>
                  <option value="burst">Burst</option>
                </select>
              </label>
              {stage.emissionMode === 'burst' ? (
                <label>
                  BURST COUNT
                  <NumericInput
                    min={1}
                    max={1200}
                    step={1}
                    value={stage.burstCount ?? 24}
                    onCommit={(burstCount) => onPatch({ burstCount: Math.round(burstCount) })}
                  />
                </label>
              ) : (
                <label>
                  PREWARM · SECONDS
                  <NumericInput
                    min={0}
                    max={10}
                    step={0.1}
                    value={stage.prewarmSeconds ?? 0}
                    onCommit={(prewarmSeconds) => onPatch({ prewarmSeconds })}
                  />
                </label>
              )}
              {fields(stage.emissionMode === 'burst' ? ['fxLifetime'] : ['fxRate', 'fxLifetime'])}
              <label>
                AFTER CLIP
                <select
                  value={stage.endBehavior ?? 'cut'}
                  onChange={(event) =>
                    onPatch({
                      endBehavior: event.target.value as BuildingAnimationStage['endBehavior'],
                    })
                  }
                >
                  <option value="cut">Cut immediately</option>
                  <option value="tail">Drain alive particles</option>
                  <option value="fade">Fade tail / 0.5 s</option>
                </select>
              </label>
            </div>
          </details>
          <details className="effect-settings-group">
            <summary>Форма эмиттера</summary>
            <div className="effect-group-content">
              <label>
                EMITTER SHAPE
                <select
                  value={stage.emitterShape ?? 'point'}
                  onChange={(event) =>
                    onPatch({
                      emitterShape: event.target.value as BuildingAnimationStage['emitterShape'],
                    })
                  }
                >
                  {['point', 'line', 'circle', 'rectangle', 'contour'].map((shape) => (
                    <option key={shape}>{shape}</option>
                  ))}
                </select>
              </label>
              {stage.emitterShape === 'contour' ? (
                <label>
                  ALPHA CONTOUR SOURCE
                  <select
                    value={stage.shapeSourceId ?? ''}
                    onChange={(event) =>
                      onPatch({ shapeSourceId: event.target.value || undefined })
                    }
                  >
                    <option value="">Choose image…</option>
                    {config.stages.filter(isImageStage).map((image) => (
                      <option key={image.id} value={image.id}>
                        {image.name}
                      </option>
                    ))}
                  </select>
                  <small>
                    Граница берётся из альфа-канала PNG; необходим загруженный источник.
                  </small>
                </label>
              ) : null}
              {fields(
                stage.emitterShape === 'circle'
                  ? ['fxEmitterRadius']
                  : stage.emitterShape === 'line'
                    ? ['fxEmitterWidth']
                    : stage.emitterShape === 'rectangle'
                      ? ['fxEmitterWidth', 'fxEmitterHeight']
                      : [],
              )}
            </div>
          </details>
          <details className="effect-settings-group" open>
            <summary>Движение</summary>
            <div className="effect-group-content">
              {fields(['fxSpeed', 'fxDirection', 'fxSpread'])}
              <details>
                <summary>Гравитация, ветер и координаты</summary>
                <div className="effect-group-content">
                  {fields(['fxGravity', 'fxGravityAngle', 'fxWind', 'fxTurbulence'])}
                  <label>
                    PARTICLE SPACE
                    <select
                      value={stage.particleSpace ?? 'local'}
                      onChange={(event) =>
                        onPatch({
                          particleSpace: event.target
                            .value as BuildingAnimationStage['particleSpace'],
                        })
                      }
                    >
                      <option value="composition">Composition / leave a trail</option>
                      <option value="local">Local / follow emitter</option>
                    </select>
                  </label>
                  <label>
                    GRAVITY SPACE
                    <select
                      value={stage.gravitySpace ?? 'composition'}
                      onChange={(event) =>
                        onPatch({
                          gravitySpace: event.target
                            .value as BuildingAnimationStage['gravitySpace'],
                        })
                      }
                    >
                      <option value="composition">Composition</option>
                      <option value="local">Emitter local</option>
                    </select>
                  </label>
                </div>
              </details>
            </div>
          </details>
          <details className="effect-settings-group" open>
            <summary>Внешний вид</summary>
            <div className="effect-group-content">
              {fields(['fxSize'])}
              <details>
                <summary>Текстура и спрайт-лист</summary>
                <div className="effect-group-content">
                  <label>
                    PARTICLE TEXTURE ID
                    <TextInput
                      value={stage.particleTextureId ?? ''}
                      onCommit={(particleTextureId) =>
                        onPatch({ particleTextureId: particleTextureId.trim() || undefined })
                      }
                    />
                  </label>
                  <label className="particle-texture-upload">
                    IMPORT PARTICLE PNG
                    <input
                      type="file"
                      accept="image/png"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) onTexture(file);
                        event.target.value = '';
                      }}
                    />
                  </label>
                  {stage.particleTextureId ? (
                    <div className="field-grid two">
                      {(['spriteColumns', 'spriteRows'] as const).map((property) => (
                        <label key={property}>
                          {property === 'spriteColumns' ? 'ATLAS COLUMNS' : 'ATLAS ROWS'}
                          <NumericInput
                            min={1}
                            max={32}
                            step={1}
                            value={stage[property] ?? 1}
                            onCommit={(value) => onPatch({ [property]: Math.round(value) })}
                          />
                        </label>
                      ))}
                    </div>
                  ) : null}
                  {stage.particleTextureId &&
                  (stage.spriteColumns ?? 1) * (stage.spriteRows ?? 1) > 1
                    ? fields(['fxFrameRate'])
                    : null}
                </div>
              </details>
              <details>
                <summary>Свечение, след и RGB</summary>
                <div className="effect-group-content">
                  {fields(['fxFlicker', 'fxStretch', 'fxTrail', 'fxRed', 'fxGreen', 'fxBlue'])}
                </div>
              </details>
            </div>
          </details>
          <details className="effect-settings-group">
            <summary>Изменение за жизнь частицы</summary>
            <div className="effect-group-content">
              <CurveEditor
                label="SIZE ×"
                max={10}
                curve={
                  stage.sizeCurve ?? [
                    { age: 0, value: 1 },
                    { age: 1, value: 0.3 },
                  ]
                }
                onChange={(sizeCurve) => onPatch({ sizeCurve })}
              />
              <CurveEditor
                label="ALPHA"
                max={1}
                curve={
                  stage.alphaCurve ?? [
                    { age: 0, value: 1 },
                    { age: 1, value: 0 },
                  ]
                }
                onChange={(alphaCurve) => onPatch({ alphaCurve })}
              />
              <div className="particle-curve-editor">
                <strong>COLOR OVER LIFE</strong>
                {(stage.colorCurve ?? []).map((point, index) => (
                  <div className="particle-curve-point" key={index}>
                    <NumericInput
                      value={point.age}
                      min={index ? stage.colorCurve![index - 1]!.age + 0.001 : 0}
                      max={
                        index < stage.colorCurve!.length - 1
                          ? stage.colorCurve![index + 1]!.age - 0.001
                          : 1
                      }
                      step={0.05}
                      onCommit={(age) =>
                        onPatch({
                          colorCurve: stage.colorCurve!.map((item, i) =>
                            i === index ? { ...item, age } : item,
                          ),
                        })
                      }
                    />
                    <input
                      type="color"
                      value={point.color}
                      onChange={(event) =>
                        onPatch({
                          colorCurve: stage.colorCurve!.map((item, i) =>
                            i === index ? { ...item, color: event.target.value } : item,
                          ),
                        })
                      }
                    />
                    <button
                      aria-label={`Remove color point ${index}`}
                      onClick={() =>
                        onPatch({ colorCurve: stage.colorCurve!.filter((_, i) => i !== index) })
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  disabled={(stage.colorCurve?.length ?? 0) >= 16}
                  onClick={() => {
                    const points = stage.colorCurve ?? [];
                    if (!points.length)
                      return onPatch({
                        colorCurve: [
                          { age: 0, color },
                          { age: 1, color: '#402010' },
                        ],
                      });
                    let index = 1;
                    for (let i = 2; i < points.length; i++)
                      if (
                        points[i]!.age - points[i - 1]!.age >
                        points[index]!.age - points[index - 1]!.age
                      )
                        index = i;
                    if (points.length === 1)
                      return onPatch({
                        colorCurve: [...points, { age: points[0]!.age === 1 ? 0 : 1, color }].sort(
                          (a, b) => a.age - b.age,
                        ),
                      });
                    onPatch({
                      colorCurve: [
                        ...points.slice(0, index),
                        { age: (points[index - 1]!.age + points[index]!.age) / 2, color },
                        ...points.slice(index),
                      ],
                    });
                  }}
                >
                  ＋ color point
                </button>
                <button onClick={() => onPatch({ colorCurve: [] })}>Use birth RGB</button>
              </div>
            </div>
          </details>
          <details className="effect-settings-group">
            <summary>Расширенные · seed и бюджет</summary>
            <div className="effect-group-content">
              <div className="field-grid two">
                <label>
                  SEED
                  <NumericInput
                    min={0}
                    max={65535}
                    step={1}
                    value={stage.seed ?? 1}
                    onCommit={(seed) => onPatch({ seed: Math.round(seed) })}
                  />
                </label>
                <label>
                  BUDGET
                  <NumericInput
                    min={1}
                    max={1200}
                    step={1}
                    value={stage.particleBudget ?? 600}
                    onCommit={(particleBudget) =>
                      onPatch({ particleBudget: Math.round(particleBudget) })
                    }
                  />
                </label>
              </div>
              <output className="particle-stats">
                {visible ? live.filter((birth) => birth.admitted).length : 0} alive ·{' '}
                {visible ? live.filter((birth) => !birth.admitted).length : 0} rejected · limit{' '}
                {stage.particleBudget ?? 600}
              </output>
              <small>При заполненном бюджете новые частицы пропускаются; живые сохраняются.</small>
            </div>
          </details>
        </>
      ) : (
        fields(effectProperties(stage))
      )}
      <small>
        ◷ включает анимацию параметра, ◆ добавляет ключ. Mix фильтра регулирует смешивание исходного
        и обработанного изображения.
      </small>
      {stage.kind === 'particles' ? (
        <small>
          Параметры рождения фиксируются при эмиссии. При заполненном лимите новые частицы
          пропускаются; живые сохраняются.
        </small>
      ) : null}
    </div>
  );
}
