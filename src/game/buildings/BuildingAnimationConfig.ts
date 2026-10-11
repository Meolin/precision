import {
  buildingTransitionCatalog,
  buildingTransitionDirections,
  createDefaultBuildingTransition,
  transitionParameterDefaults,
  type BuildingTransitionType,
} from './BuildingAnimationTransitions';

import {
  animationEffectParameters,
  isImageStage,
  effectParameter,
  animationFilterCatalog,
  stageTrackProperties,
  type AnimationEffectProperty,
  type AnimationFilterType,
  type AnimationMediaKind,
  type AnimationParticlePreset,
  type ParticleCurvePoint,
  type ParticleColorPoint,
  type AnimationEffectPreset,
} from './BuildingAnimationEffects';

export const buildingAnimationSchemaVersion = 9 as const;

export type { BuildingTransitionType } from './BuildingAnimationTransitions';
export type DissolveDirection = (typeof buildingTransitionDirections)[number]['id'];
export type BuildingAnimationEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
export type BuildingAnimationBlendMode = 'normal' | 'add' | 'screen' | 'multiply' | 'overlay';
export type BuildingTextureScaleMode = 'linear' | 'nearest';
export const buildingAnimationTrackProperties = [
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
  'fxRate',
  'fxLifetime',
  'fxSpeed',
  'fxSpread',
  'fxGravity',
  'fxSize',
  'fxRadius',
  'fxStrength',
  'fxDirection',
  'fxGravityAngle',
  'fxEmitterRadius',
  'fxEmitterWidth',
  'fxEmitterHeight',
  'fxWind',
  'fxTurbulence',
  'fxFlicker',
  'fxStretch',
  'fxTrail',
  'fxFrequency',
  'fxWaveLength',
  'fxSoftness',
  'fxBrightness',
  'fxContrast',
  'fxSaturation',
  'fxHue',
  'fxRed',
  'fxGreen',
  'fxBlue',
  'fxFrameRate',
] as const;
export type BuildingAnimationTrackProperty = (typeof buildingAnimationTrackProperties)[number];
export type BuildingKeyInterpolation =
  'step' | 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'cubic-bezier';

export interface BuildingAnimationKeyframe {
  id: string;
  time: number;
  value: number;
  /** Interpolation from this key to the next key. */
  interpolation: BuildingKeyInterpolation;
  /** CSS-style cubic Bézier control points [x1, y1, x2, y2]. */
  bezier: [number, number, number, number];
}

export interface BuildingAnimationTrack {
  stageId: string;
  property: BuildingAnimationTrackProperty;
  keys: BuildingAnimationKeyframe[];
}

export interface BuildingAnimationBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BuildingAnimationHitbox extends BuildingAnimationBounds {
  scaleX: number;
  scaleY: number;
}

export interface BuildingTextureOptimization {
  scaleMode: BuildingTextureScaleMode;
  mipmaps: boolean;
  anisotropy: 1 | 2 | 4 | 8 | 16;
}

export interface BuildingAnimationStage extends Partial<Record<AnimationEffectProperty, number>> {
  /** Missing kind is a legacy image resource. Procedural resources never load a texture. */
  kind?: AnimationMediaKind;
  parentId?: string;
  filterType?: AnimationFilterType;
  particlePreset?: AnimationParticlePreset;
  color?: string;
  seed?: number;
  enabled?: boolean;
  hidden?: boolean;
  solo?: boolean;
  locked?: boolean;
  coordinateSpace?: 'local' | 'composition';
  particleSpace?: 'local' | 'composition';
  gravitySpace?: 'local' | 'composition';
  emissionMode?: 'continuous' | 'burst';
  endBehavior?: 'cut' | 'tail' | 'fade';
  emissionStart?: number;
  burstCount?: number;
  prewarmSeconds?: number;
  particleBudget?: number;
  emitterShape?: 'point' | 'line' | 'circle' | 'rectangle' | 'contour';
  shapeSourceId?: string;
  particleTextureId?: string;
  spriteColumns?: number;
  spriteRows?: number;
  blendMode?: BuildingAnimationBlendMode;
  sizeCurve?: ParticleCurvePoint[];
  alphaCurve?: ParticleCurvePoint[];
  colorCurve?: ParticleColorPoint[];
  id: string;
  name: string;
  assetId: string;
  milestone: number;
  inPoint: number;
  outPoint: number;
  layerOrder: number;
  x: number;
  y: number;
  scale: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  skewX: number;
  skewY: number;
  pivotX: number;
  pivotY: number;
}

export interface BuildingAnimationTimeline {
  durationSeconds: number;
  frameRate: number;
  workAreaStart: number;
  workAreaEnd: number;
}

export interface BuildingAnimationTransition {
  fromStageId: string;
  toStageId: string;
  type: BuildingTransitionType;
  direction: DissolveDirection;
  noiseScale: number;
  directionStrength: number;
  edgeWidth: number;
  edgeIntensity: number;
  edgeColor: string;
  easing: BuildingAnimationEasing;
  blendMode: BuildingAnimationBlendMode;
  softness: number;
  strength: number;
  segments: number;
  angle: number;
  centerX: number;
  centerY: number;
  seed: number;
  reverse: boolean;
}

/** Audio times are seconds; marker times use normalized animation progress. */
export interface BuildingAnimationSound {
  id: string;
  name: string;
  assetId: string;
  sourceDuration: number;
  startSeconds: number;
  offsetSeconds: number;
  durationSeconds: number;
  volume: number;
  muted: boolean;
  solo: boolean;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  waveform: number[];
}

export interface BuildingAnimationMarker {
  id: string;
  name: string;
  time: number;
}

export interface BuildingAnimationConfig {
  schemaVersion: typeof buildingAnimationSchemaVersion;
  id: string;
  canvas: { width: number; height: number };
  origin: { x: number; y: number };
  worldSize: { widthMeters: number; heightMeters: number };
  alphaBounds: BuildingAnimationBounds;
  hitbox: BuildingAnimationHitbox;
  textureOptimization: BuildingTextureOptimization;
  stages: BuildingAnimationStage[];
  timeline: BuildingAnimationTimeline;
  tracks: BuildingAnimationTrack[];
  transitions: BuildingAnimationTransition[];
  vfx: unknown[];
  sounds: BuildingAnimationSound[];
  markers: BuildingAnimationMarker[];
  effectPresets?: AnimationEffectPreset[];
}

export interface BuildingAnimationValidationResult {
  valid: boolean;
  errors: string[];
}

const finite = (value: number) => Number.isFinite(value);
const hexColor = /^#[0-9a-f]{6}$/i;

export function validateBuildingAnimationConfig(
  config: BuildingAnimationConfig,
): BuildingAnimationValidationResult {
  const errors: string[] = [];
  if (config.schemaVersion !== buildingAnimationSchemaVersion)
    errors.push(`Unsupported schemaVersion: ${String(config.schemaVersion)}`);
  if (typeof config.id !== 'string' || !config.id.trim()) errors.push('Config id is required.');
  if (!config.canvas || typeof config.canvas !== 'object')
    return { valid: false, errors: [...errors, 'Canvas is required.'] };
  if (!config.origin || typeof config.origin !== 'object')
    return { valid: false, errors: [...errors, 'Origin is required.'] };
  if (!config.worldSize || typeof config.worldSize !== 'object')
    return { valid: false, errors: [...errors, 'World size is required.'] };
  if (!config.alphaBounds || typeof config.alphaBounds !== 'object')
    return { valid: false, errors: [...errors, 'Alpha bounds are required.'] };
  if (!config.hitbox || typeof config.hitbox !== 'object')
    return { valid: false, errors: [...errors, 'Hitbox is required.'] };
  if (!config.textureOptimization || typeof config.textureOptimization !== 'object')
    return { valid: false, errors: [...errors, 'Texture optimization is required.'] };
  if (
    !Array.isArray(config.stages) ||
    !Array.isArray(config.transitions) ||
    !Array.isArray(config.tracks)
  )
    return { valid: false, errors: [...errors, 'Stages, tracks and transitions must be arrays.'] };
  if (!Array.isArray(config.vfx) || !Array.isArray(config.sounds))
    errors.push('vfx and sounds must be arrays.');
  if (!config.timeline || typeof config.timeline !== 'object')
    return { valid: false, errors: [...errors, 'Timeline is required.'] };
  if (
    !finite(config.timeline.durationSeconds) ||
    config.timeline.durationSeconds <= 0 ||
    config.timeline.durationSeconds > 600
  )
    errors.push('Timeline duration must be in (0, 600] seconds.');
  if (
    !Number.isInteger(config.timeline.frameRate) ||
    config.timeline.frameRate < 1 ||
    config.timeline.frameRate > 120
  )
    errors.push('Timeline frame rate must be an integer between 1 and 120.');
  if (
    !finite(config.timeline.workAreaStart) ||
    !finite(config.timeline.workAreaEnd) ||
    config.timeline.workAreaStart < 0 ||
    config.timeline.workAreaEnd > 1 ||
    config.timeline.workAreaStart >= config.timeline.workAreaEnd
  )
    errors.push('Timeline work area must be within [0, 1] and have positive length.');
  if (!finite(config.canvas.width) || config.canvas.width <= 0)
    errors.push('Canvas width must be positive.');
  if (!finite(config.canvas.height) || config.canvas.height <= 0)
    errors.push('Canvas height must be positive.');
  if (!finite(config.origin.x) || !finite(config.origin.y)) errors.push('Origin must be finite.');
  if (
    ![
      config.alphaBounds.x,
      config.alphaBounds.y,
      config.alphaBounds.width,
      config.alphaBounds.height,
    ].every(finite) ||
    config.alphaBounds.width <= 0 ||
    config.alphaBounds.height <= 0
  )
    errors.push('Alpha bounds must be positive and finite.');
  if (
    !finite(config.worldSize.widthMeters) ||
    !finite(config.worldSize.heightMeters) ||
    config.worldSize.widthMeters <= 0 ||
    config.worldSize.heightMeters <= 0
  )
    errors.push('World size must be positive.');
  if (
    ![
      config.hitbox.x,
      config.hitbox.y,
      config.hitbox.width,
      config.hitbox.height,
      config.hitbox.scaleX,
      config.hitbox.scaleY,
    ].every(finite) ||
    config.hitbox.width <= 0 ||
    config.hitbox.height <= 0 ||
    config.hitbox.scaleX <= 0 ||
    config.hitbox.scaleY <= 0
  )
    errors.push('Hitbox bounds and scale must be positive and finite.');
  if (!['linear', 'nearest'].includes(config.textureOptimization.scaleMode))
    errors.push('Texture scaleMode is invalid.');
  if (![1, 2, 4, 8, 16].includes(config.textureOptimization.anisotropy))
    errors.push('Texture anisotropy is invalid.');
  if (config.stages.length < 1) errors.push('At least one stage is required.');

  const soundIds = new Set<string>();
  for (const sound of Array.isArray(config.sounds) ? config.sounds : []) {
    if (!sound || typeof sound !== 'object') {
      errors.push('Every sound must be an object.');
      continue;
    }
    if (typeof sound.id !== 'string' || !sound.id.trim() || soundIds.has(sound.id))
      errors.push('Sounds need unique IDs.');
    soundIds.add(sound.id);
    if (typeof sound.name !== 'string' || !sound.name.trim())
      errors.push('Sound name is required.');
    if (
      typeof sound.assetId !== 'string' ||
      !sound.assetId.trim() ||
      sound.assetId.startsWith('blob:')
    )
      errors.push('Sound assetId must be a stable resource path.');
    if (
      ![
        sound.sourceDuration,
        sound.startSeconds,
        sound.offsetSeconds,
        sound.durationSeconds,
        sound.volume,
        sound.fadeInSeconds,
        sound.fadeOutSeconds,
      ].every(finite) ||
      sound.sourceDuration <= 0 ||
      sound.startSeconds < 0 ||
      sound.offsetSeconds < 0 ||
      sound.durationSeconds <= 0 ||
      sound.offsetSeconds + sound.durationSeconds > sound.sourceDuration + 0.000001 ||
      sound.volume < 0 ||
      sound.volume > 1 ||
      sound.fadeInSeconds < 0 ||
      sound.fadeOutSeconds < 0 ||
      sound.fadeInSeconds + sound.fadeOutSeconds > sound.durationSeconds + 0.000001
    )
      errors.push('Sound timing, volume or fades are invalid.');
    if (typeof sound.muted !== 'boolean' || typeof sound.solo !== 'boolean')
      errors.push('Sound mute/solo flags must be boolean.');
    if (
      !Array.isArray(sound.waveform) ||
      sound.waveform.length > 1024 ||
      !sound.waveform.every((point) => finite(point) && point >= 0 && point <= 1)
    )
      errors.push('Sound waveform must contain up to 1024 normalized peaks.');
  }
  if (!Array.isArray(config.markers)) errors.push('Markers must be an array.');
  const markerIds = new Set<string>();
  for (const marker of Array.isArray(config.markers) ? config.markers : []) {
    if (!marker || typeof marker !== 'object') {
      errors.push('Every marker must be an object.');
      continue;
    }
    if (
      typeof marker.id !== 'string' ||
      !marker.id.trim() ||
      markerIds.has(marker.id) ||
      typeof marker.name !== 'string' ||
      !marker.name.trim() ||
      !finite(marker.time) ||
      marker.time < 0 ||
      marker.time > 1
    )
      errors.push('Marker ID, name or time is invalid.');
    markerIds.add(marker.id);
  }

  const stageIds = new Set<string>();
  const assetIds = new Set<string>();
  const layerOrders = new Set<number>();
  let previousMilestone = -1;
  for (const [index, stage] of config.stages.entries()) {
    if (!stage || typeof stage !== 'object') {
      errors.push(`Stage ${index + 1} must be an object.`);
      continue;
    }
    if (typeof stage.id !== 'string' || !stage.id.trim() || stageIds.has(stage.id))
      errors.push(`Stage ${index + 1} needs a unique id.`);
    else stageIds.add(stage.id);
    if (typeof stage.assetId !== 'string' || !stage.assetId.trim())
      errors.push(`Stage ${index + 1} needs an assetId.`);
    else if (stage.assetId.startsWith('blob:'))
      errors.push(`Stage ${index + 1} assetId cannot be a blob URL.`);
    if (assetIds.has(stage.assetId)) errors.push(`assetId "${stage.assetId}" is duplicated.`);
    assetIds.add(stage.assetId);
    if (!finite(stage.milestone) || stage.milestone < 0 || stage.milestone > 1)
      errors.push(`Stage ${index + 1} milestone must be between 0 and 1.`);
    if (isImageStage(stage) && stage.milestone <= previousMilestone)
      errors.push(`Stage ${index + 1} milestone must be greater than the previous milestone.`);
    if (isImageStage(stage)) previousMilestone = stage.milestone;
    if (
      stage.kind !== undefined &&
      !['image', 'particles', 'light', 'filter', 'ring'].includes(stage.kind)
    )
      errors.push('Unknown animation media kind.');
    if (stage.parentId !== undefined && stage.kind !== 'filter')
      errors.push('Only filters can depend on a resource.');
    if (!isImageStage(stage)) {
      if (!hexColor.test(stage.color ?? '')) errors.push('Effect color must be #RRGGBB.');
      if (!Number.isInteger(stage.seed) || stage.seed! < 0 || stage.seed! > 65535)
        errors.push('Effect seed must be an integer in [0, 65535].');
      if (typeof stage.enabled !== 'boolean') errors.push('Effect enabled must be boolean.');
      if (
        stage.kind === 'particles' &&
        !['sparks', 'smoke', 'embers'].includes(stage.particlePreset ?? '')
      )
        errors.push('Unknown particle preset.');
      if (stage.kind === 'filter') {
        if (!Object.hasOwn(animationFilterCatalog, stage.filterType ?? ''))
          errors.push('Unknown filter type.');
        if (
          !config.stages.some(
            (parent) =>
              parent &&
              parent.id === stage.parentId &&
              parent.id !== stage.id &&
              parent.kind !== 'filter',
          )
        )
          errors.push('Filter must reference an existing image or generator.');
      }
      for (const property of stageTrackProperties(stage)) {
        if (!(property in animationEffectParameters)) continue;
        const range = effectParameter(stage, property as AnimationEffectProperty);
        const value = stage[property];
        if (value !== undefined && (!finite(value) || value < range.min || value > range.max))
          errors.push(`Effect ${property} is outside its supported range.`);
      }
    }
    for (const property of ['hidden', 'solo', 'locked'] as const)
      if (stage[property] !== undefined && typeof stage[property] !== 'boolean')
        errors.push(`Layer ${property} must be boolean.`);
    for (const property of ['coordinateSpace', 'particleSpace', 'gravitySpace'] as const)
      if (stage[property] !== undefined && !['local', 'composition'].includes(stage[property]!))
        errors.push('Unknown effect coordinate space.');
    if (
      stage.emissionStart !== undefined &&
      (!finite(stage.emissionStart) || stage.emissionStart < -1 || stage.emissionStart > 1)
    )
      errors.push('Invalid emission start.');
    if (stage.kind === 'particles') {
      if (stage.emissionMode !== undefined && !['continuous', 'burst'].includes(stage.emissionMode))
        errors.push('Unknown emission mode.');
      if (stage.endBehavior !== undefined && !['cut', 'tail', 'fade'].includes(stage.endBehavior))
        errors.push('Unknown particle end behavior.');
      if (
        stage.emitterShape !== undefined &&
        !['point', 'line', 'circle', 'rectangle', 'contour'].includes(stage.emitterShape)
      )
        errors.push('Unknown emitter shape.');
      for (const [name, value, min, max] of [
        ['burstCount', stage.burstCount, 1, 1200],
        ['particleBudget', stage.particleBudget, 1, 1200],
        ['prewarmSeconds', stage.prewarmSeconds, 0, 10],
        ['spriteColumns', stage.spriteColumns, 1, 32],
        ['spriteRows', stage.spriteRows, 1, 32],
      ] as const)
        if (
          value !== undefined &&
          (!finite(value) ||
            value < min ||
            value > max ||
            (name !== 'prewarmSeconds' && !Number.isInteger(value)))
        )
          errors.push(`Invalid particle ${name}.`);
      if (
        stage.particleTextureId !== undefined &&
        (!stage.particleTextureId.trim() || stage.particleTextureId.startsWith('blob:'))
      )
        errors.push('Particle texture ID must be a stable asset path.');
      if (
        stage.emitterShape === 'contour' &&
        stage.shapeSourceId !== undefined &&
        !config.stages.some(
          (source) => source && source.id === stage.shapeSourceId && isImageStage(source),
        )
      )
        errors.push('Contour emission requires an image resource.');
      for (const name of ['sizeCurve', 'alphaCurve'] as const) {
        const curve = stage[name];
        if (
          curve !== undefined &&
          (!Array.isArray(curve) ||
            curve.length < 2 ||
            curve.length > 16 ||
            curve.some(
              (point, i) =>
                !point ||
                !finite(point.age) ||
                point.age < 0 ||
                point.age > 1 ||
                (i > 0 && point.age <= curve[i - 1]!.age) ||
                !finite(point.value) ||
                point.value < 0 ||
                point.value > (name === 'alphaCurve' ? 1 : 10),
            ) ||
            curve[0]?.age !== 0 ||
            curve.at(-1)?.age !== 1)
        )
          errors.push(`Invalid ${name}.`);
      }
      const colors = stage.colorCurve;
      if (
        colors !== undefined &&
        (!Array.isArray(colors) ||
          colors.length > 16 ||
          colors.some(
            (point, i) =>
              !point ||
              !finite(point.age) ||
              point.age < 0 ||
              point.age > 1 ||
              !hexColor.test(point.color) ||
              (i > 0 && point.age <= colors[i - 1]!.age),
          ))
      )
        errors.push('Invalid particle color curve.');
    }
    if (
      stage.blendMode !== undefined &&
      !['normal', 'add', 'screen', 'multiply', 'overlay'].includes(stage.blendMode)
    )
      errors.push('Unknown resource blend mode.');
    if (
      !finite(stage.inPoint) ||
      !finite(stage.outPoint) ||
      stage.inPoint < 0 ||
      stage.outPoint > 1 ||
      stage.inPoint >= stage.outPoint
    )
      errors.push(`Stage ${index + 1} visibility range is invalid.`);
    if (
      !Number.isInteger(stage.layerOrder) ||
      stage.layerOrder < 0 ||
      stage.layerOrder >= config.stages.length ||
      layerOrders.has(stage.layerOrder)
    )
      errors.push(`Stage ${index + 1} layer order must be unique.`);
    layerOrders.add(stage.layerOrder);
    if (![stage.x, stage.y, stage.scale].every(finite) || stage.scale <= 0)
      errors.push(`Stage ${index + 1} alignment is invalid.`);
    if (
      ![
        stage.scaleX,
        stage.scaleY,
        stage.rotation,
        stage.opacity,
        stage.skewX,
        stage.skewY,
        stage.pivotX,
        stage.pivotY,
      ].every(finite) ||
      stage.scaleX <= 0 ||
      stage.scaleY <= 0 ||
      stage.opacity < 0 ||
      stage.opacity > 1
    )
      errors.push(`Stage ${index + 1} transform defaults are invalid.`);
  }
  const imageStages = config.stages.filter((stage) => stage && isImageStage(stage));
  if (imageStages.length && imageStages[0]?.milestone !== 0)
    errors.push('The first milestone must be 0.');

  const trackKeys = new Set<string>();
  const keyIds = new Set<string>();
  for (const track of config.tracks) {
    if (!track || typeof track !== 'object') {
      errors.push('Every animation track must be an object.');
      continue;
    }
    if (!stageIds.has(track.stageId)) errors.push('A track references an unknown stage.');
    if (!buildingAnimationTrackProperties.includes(track.property))
      errors.push('A track has an unsupported property.');
    const trackStage = config.stages.find((stage) => stage?.id === track.stageId);
    if (trackStage && !stageTrackProperties(trackStage).includes(track.property))
      errors.push('Track property is not supported by this resource.');
    const trackKey = `${track.stageId}:${track.property}`;
    if (trackKeys.has(trackKey)) errors.push(`Track ${trackKey} is duplicated.`);
    trackKeys.add(trackKey);
    if (!Array.isArray(track.keys) || !track.keys.length) {
      errors.push(`Track ${trackKey} must contain at least one key.`);
      continue;
    }
    let previousTime = -1;
    for (const key of track.keys) {
      if (!key || typeof key !== 'object') {
        errors.push(`Track ${trackKey} contains an invalid key.`);
        continue;
      }
      if (typeof key.id !== 'string' || !key.id.trim() || keyIds.has(key.id))
        errors.push(`Track ${trackKey} needs unique key IDs.`);
      else keyIds.add(key.id);
      if (!finite(key.time) || key.time < 0 || key.time > 1 || key.time <= previousTime)
        errors.push(`Track ${trackKey} key times must be strictly increasing in [0, 1].`);
      previousTime = key.time;
      if (!finite(key.value)) errors.push(`Track ${trackKey} key values must be finite.`);
      if (track.property in animationEffectParameters) {
        const range = effectParameter(trackStage, track.property as AnimationEffectProperty);
        if (key.value < range.min || key.value > range.max)
          errors.push(`Track ${trackKey} value is outside its supported range.`);
      }
      if ((track.property === 'scaleX' || track.property === 'scaleY') && key.value <= 0)
        errors.push(`Track ${trackKey} scale must be positive.`);
      if (track.property === 'opacity' && (key.value < 0 || key.value > 1))
        errors.push(`Track ${trackKey} opacity must be in [0, 1].`);
      if (
        !['step', 'linear', 'ease-in', 'ease-out', 'ease-in-out', 'cubic-bezier'].includes(
          key.interpolation,
        )
      )
        errors.push(`Track ${trackKey} interpolation is invalid.`);
      if (
        !Array.isArray(key.bezier) ||
        key.bezier.length !== 4 ||
        !key.bezier.every((point) => finite(point) && point >= 0 && point <= 1)
      )
        errors.push(`Track ${trackKey} Bézier points must be in [0, 1].`);
    }
  }

  const transitionKeys = new Set(
    config.transitions.flatMap((item) =>
      item && typeof item === 'object' ? [`${item.fromStageId}:${item.toStageId}`] : [],
    ),
  );
  for (let index = 1; index < imageStages.length; index++) {
    const from = imageStages[index - 1];
    const to = imageStages[index];
    if (!from || typeof from !== 'object' || !to || typeof to !== 'object') continue;
    if (!transitionKeys.has(`${from.id}:${to.id}`))
      errors.push(`Missing transition ${from.id} → ${to.id}.`);
  }
  for (const transition of config.transitions) {
    if (!transition || typeof transition !== 'object') {
      errors.push('Every transition must be an object.');
      continue;
    }
    if (!stageIds.has(transition.fromStageId) || !stageIds.has(transition.toStageId))
      errors.push('A transition references an unknown stage.');
    if (
      ![transition.fromStageId, transition.toStageId].every((id) =>
        imageStages.some((stage) => stage.id === id),
      )
    )
      errors.push('Transitions can only connect image stages.');
    if (!buildingTransitionCatalog.some((entry) => entry.id === transition.type))
      errors.push('Transition type is invalid.');
    if (!buildingTransitionDirections.some((entry) => entry.id === transition.direction))
      errors.push('Transition direction is invalid.');
    if (!['linear', 'ease-in', 'ease-out', 'ease-in-out'].includes(transition.easing))
      errors.push('Transition easing is invalid.');
    if (!hexColor.test(transition.edgeColor)) errors.push('Transition edgeColor must be #RRGGBB.');
    if (!['normal', 'add', 'screen', 'multiply', 'overlay'].includes(transition.blendMode))
      errors.push('Transition blendMode is invalid.');
    if (
      ![
        transition.noiseScale,
        transition.directionStrength,
        transition.edgeWidth,
        transition.edgeIntensity,
      ].every(finite)
    )
      errors.push('Transition numeric parameters must be finite.');
    const ranges: [string, number, number, number][] = [
      ['softness', transition.softness, 0, 1],
      ['strength', transition.strength, 0, 2],
      ['segments', transition.segments, 2, 64],
      ['angle', transition.angle, -360, 360],
      ['centerX', transition.centerX, 0, 1],
      ['centerY', transition.centerY, 0, 1],
      ['seed', transition.seed, 0, 65535],
    ];
    for (const [name, value, min, max] of ranges)
      if (!finite(value) || value < min || value > max)
        errors.push(`Transition ${name} must be between ${min} and ${max}.`);
    if (!Number.isInteger(transition.segments) || !Number.isInteger(transition.seed))
      errors.push('Transition segments and seed must be integers.');
    if (typeof transition.reverse !== 'boolean') errors.push('Transition reverse must be boolean.');
  }
  if (config.effectPresets !== undefined) {
    const presetIds = new Set<string>();
    if (!Array.isArray(config.effectPresets) || config.effectPresets.length > 100)
      errors.push('Invalid effect preset library.');
    else
      for (const preset of config.effectPresets) {
        if (
          !preset ||
          typeof preset.id !== 'string' ||
          !preset.id.trim() ||
          typeof preset.name !== 'string' ||
          !preset.name.trim() ||
          !Array.isArray(preset.stages) ||
          !preset.stages.length ||
          !Array.isArray(preset.tracks)
        ) {
          errors.push('Invalid effect preset.');
          continue;
        }
        if (presetIds.has(preset.id)) errors.push('Effect preset IDs must be unique.');
        presetIds.add(preset.id);
        if (
          preset.durationSeconds !== undefined &&
          (!finite(preset.durationSeconds) ||
            preset.durationSeconds <= 0 ||
            preset.durationSeconds > 1200)
        )
          errors.push('Invalid effect preset duration.');
        const presetConfig = {
          ...config,
          stages: preset.stages,
          tracks: preset.tracks,
          transitions: [],
          sounds: [],
          markers: [],
          effectPresets: [],
        };
        if (!validateBuildingAnimationConfig(presetConfig).valid)
          errors.push(`Invalid effect preset: ${preset.name}.`);
      }
  }
  return { valid: errors.length === 0, errors };
}

export function loadBuildingAnimationConfig(value: unknown): BuildingAnimationConfig {
  if (!value || typeof value !== 'object') throw new Error('Animation config must be an object.');
  const imported = value as Record<string, unknown>;
  const legacy =
    imported.schemaVersion === 2 || imported.schemaVersion === 3 || imported.schemaVersion === 4;
  const config = legacy
    ? ({
        ...imported,
        schemaVersion: buildingAnimationSchemaVersion,
        markers: [],
        timeline:
          imported.schemaVersion === 4
            ? imported.timeline
            : { durationSeconds: 4, frameRate: 30, workAreaStart: 0, workAreaEnd: 1 },
        stages: Array.isArray(imported.stages)
          ? imported.stages.map((stage, index, stages) => ({
              ...stage,
              inPoint: stages[index - 1]?.milestone ?? 0,
              outPoint: stages[index + 1]?.milestone ?? 1,
              layerOrder: stages.length - 1 - index,
              scaleX: stage.scaleX ?? stage.scale,
              scaleY: stage.scaleY ?? stage.scale,
              rotation: stage.rotation ?? 0,
              opacity: stage.opacity ?? 1,
              skewX: stage.skewX ?? 0,
              skewY: stage.skewY ?? 0,
              pivotX: stage.pivotX ?? 0,
              pivotY: stage.pivotY ?? 0,
            }))
          : imported.stages,
        tracks: imported.schemaVersion === 2 ? [] : imported.tracks,
      } as unknown as BuildingAnimationConfig)
    : imported.schemaVersion === 5 ||
        imported.schemaVersion === 6 ||
        imported.schemaVersion === 7 ||
        imported.schemaVersion === 8
      ? ({
          ...imported,
          schemaVersion: buildingAnimationSchemaVersion,
          markers: imported.schemaVersion !== 5 ? imported.markers : [],
        } as unknown as BuildingAnimationConfig)
      : (value as BuildingAnimationConfig);
  if (
    [2, 3, 4, 5, 6].includes(imported.schemaVersion as number) &&
    Array.isArray(config.transitions)
  )
    config.transitions = config.transitions.map((transition) =>
      transition && typeof transition === 'object'
        ? {
            ...transitionParameterDefaults,
            ...transition,
            // The legacy reveal was always a hard left-to-right mask.
            ...(transition.type === 'reveal' ? { direction: 'left-to-right' as const } : {}),
          }
        : transition,
    );
  if (
    [2, 3, 4, 5, 6, 7, 8].includes(imported.schemaVersion as number) &&
    Array.isArray(config.stages)
  ) {
    config.stages = config.stages.map((stage) => {
      if (!stage || isImageStage(stage)) return stage;
      const migrated = {
        ...stage,
        particleSpace: 'local' as const,
        coordinateSpace: 'composition' as const,
        endBehavior: 'cut' as const,
        emissionStart: stage.inPoint,
      };
      for (const property of stageTrackProperties(migrated))
        if (property in animationEffectParameters && migrated[property] === undefined)
          migrated[property] = effectParameter(migrated, property as AnimationEffectProperty).value;
      if (migrated.fxStrength !== undefined) {
        const range = effectParameter(migrated, 'fxStrength');
        migrated.fxStrength = Math.max(range.min, Math.min(range.max, migrated.fxStrength));
      }
      const color = Number.parseInt(stage.color?.slice(1) ?? 'ffb454', 16);
      migrated.fxRed = color >> 16;
      migrated.fxGreen = (color >> 8) & 255;
      migrated.fxBlue = color & 255;
      return migrated;
    });
    if (Array.isArray(config.tracks))
      config.tracks = config.tracks.map((track) => {
        if (!track || track.property !== 'fxStrength' || !Array.isArray(track.keys)) return track;
        const range = effectParameter(
          config.stages.find((stage) => stage?.id === track.stageId),
          'fxStrength',
        );
        return {
          ...track,
          keys: track.keys.map((key) => ({
            ...key,
            value: Math.max(range.min, Math.min(range.max, key.value)),
          })),
        };
      });
  }
  const result = validateBuildingAnimationConfig(config);
  if (!result.valid) throw new Error(result.errors.join('\n'));
  return structuredClone(config);
}

export function createDefaultBuildingAnimationConfig(): BuildingAnimationConfig {
  const names = ['Anchor', 'Core', 'Frame', 'Armor', 'Complete'];
  const milestones = [0, 0.2, 0.4, 0.65, 0.85];
  const stages = names.map((name, index) => ({
    id: `stage-${index + 1}`,
    name,
    assetId: `building/stage-${index + 1}.png`,
    milestone: milestones[index]!,
    inPoint: milestones[index - 1] ?? 0,
    outPoint: milestones[index + 1] ?? 1,
    layerOrder: names.length - 1 - index,
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
  }));
  return {
    schemaVersion: buildingAnimationSchemaVersion,
    id: 'building-construction-01',
    canvas: { width: 1024, height: 1024 },
    origin: { x: 512, y: 870 },
    worldSize: { widthMeters: 8, heightMeters: 8 },
    alphaBounds: { x: 0, y: 0, width: 1024, height: 1024 },
    hitbox: { x: 0, y: 0, width: 1024, height: 1024, scaleX: 1, scaleY: 1 },
    textureOptimization: { scaleMode: 'linear', mipmaps: true, anisotropy: 4 },
    stages,
    timeline: { durationSeconds: 4, frameRate: 30, workAreaStart: 0, workAreaEnd: 1 },
    tracks: [],
    transitions: stages
      .slice(1)
      .map((stage, index) => createDefaultBuildingTransition(stages[index]!.id, stage.id)),
    vfx: [],
    sounds: [],
    markers: [],
  };
}
