import type {
  BuildingAnimationConfig,
  BuildingAnimationStage,
  BuildingAnimationTrackProperty,
} from './BuildingAnimationConfig';

export const animationEffectParameters = {
  fxRate: { label: 'Emission / s', value: 35, min: 0, max: 120, step: 1 },
  fxLifetime: { label: 'Lifetime / s', value: 1.4, min: 0.05, max: 10, step: 0.05 },
  fxSpeed: { label: 'Speed / px/s', value: 110, min: 0, max: 2000, step: 1 },
  fxSpread: { label: 'Spread / degrees', value: 70, min: 0, max: 360, step: 1 },
  fxGravity: { label: 'Gravity / px/s²', value: 100, min: -2000, max: 2000, step: 1 },
  fxSize: { label: 'Particle size / px', value: 4, min: 0.1, max: 100, step: 0.1 },
  fxRadius: { label: 'Radius / px', value: 80, min: 1, max: 1000, step: 1 },
  fxStrength: { label: 'Strength', value: 1, min: -1, max: 10, step: 0.05 },
  fxDirection: { label: 'Direction / degrees', value: -90, min: -360, max: 360, step: 1 },
  fxGravityAngle: { label: 'Gravity direction / degrees', value: 90, min: -360, max: 360, step: 1 },
  fxEmitterRadius: { label: 'Emitter radius / px', value: 30, min: 0, max: 2000, step: 1 },
  fxEmitterWidth: { label: 'Emitter width / px', value: 100, min: 0, max: 4000, step: 1 },
  fxEmitterHeight: { label: 'Emitter height / px', value: 60, min: 0, max: 4000, step: 1 },
  fxWind: { label: 'Wind / px/s', value: 0, min: -1000, max: 1000, step: 1 },
  fxTurbulence: { label: 'Drift amplitude / px', value: 0, min: 0, max: 200, step: 1 },
  fxFlicker: { label: 'Flicker', value: 0, min: 0, max: 1, step: 0.05 },
  fxStretch: { label: 'Stretch along velocity', value: 1, min: 1, max: 20, step: 0.1 },
  fxTrail: { label: 'Trail / seconds', value: 0, min: 0, max: 0.5, step: 0.01 },
  fxFrequency: { label: 'Frequency / Hz', value: 2, min: 0, max: 30, step: 0.1 },
  fxWaveLength: { label: 'Wavelength / px', value: 80, min: 1, max: 1000, step: 1 },
  fxSoftness: { label: 'Falloff', value: 2, min: 0.2, max: 8, step: 0.1 },
  fxBrightness: { label: 'Brightness', value: 1, min: 0, max: 4, step: 0.05 },
  fxContrast: { label: 'Contrast', value: 1, min: 0, max: 4, step: 0.05 },
  fxSaturation: { label: 'Saturation', value: 1, min: 0, max: 4, step: 0.05 },
  fxHue: { label: 'Hue / degrees', value: 0, min: -180, max: 180, step: 1 },
  fxRed: { label: 'Color / R', value: 255, min: 0, max: 255, step: 1 },
  fxGreen: { label: 'Color / G', value: 180, min: 0, max: 255, step: 1 },
  fxBlue: { label: 'Color / B', value: 84, min: 0, max: 255, step: 1 },
  fxFrameRate: { label: 'Sprite frames / s', value: 12, min: 0, max: 120, step: 1 },
} as const;
export type AnimationEffectProperty = keyof typeof animationEffectParameters;
export type AnimationFilterType =
  'glow' | 'blur' | 'distort' | 'outline' | 'ripple' | 'heat' | 'color';
export type AnimationParticlePreset = 'sparks' | 'smoke' | 'embers';
export type AnimationMediaKind = 'image' | 'particles' | 'light' | 'filter' | 'ring';
export interface ParticleCurvePoint {
  age: number;
  value: number;
}
export interface ParticleColorPoint {
  age: number;
  color: string;
}
export interface AnimationEffectPreset {
  id: string;
  name: string;
  durationSeconds?: number;
  stages: BuildingAnimationStage[];
  tracks: import('./BuildingAnimationConfig').BuildingAnimationTrack[];
}
export const animationFilterCatalog: Record<
  AnimationFilterType,
  {
    label: string;
    properties: AnimationEffectProperty[];
    center?: boolean;
    strength: { min: number; max: number; value: number; label: string };
    radius: { value: number; label: string };
  }
> = {
  glow: {
    label: 'Glow',
    properties: ['fxRadius', 'fxStrength', 'fxRed', 'fxGreen', 'fxBlue'],
    strength: { min: 0, max: 10, value: 1, label: 'Glow intensity' },
    radius: { value: 20, label: 'Glow radius / px' },
  },
  blur: {
    label: 'Blur',
    properties: ['fxRadius', 'fxStrength'],
    strength: { min: 0, max: 10, value: 1, label: 'Radius multiplier' },
    radius: { value: 6, label: 'Blur radius / px' },
  },
  distort: {
    label: 'Bulge / Pinch',
    properties: ['fxRadius', 'fxStrength'],
    center: true,
    strength: { min: -1, max: 1, value: 0.5, label: 'Deformation' },
    radius: { value: 120, label: 'Deformation radius / px' },
  },
  outline: {
    label: 'Outline',
    properties: ['fxRadius', 'fxStrength', 'fxRed', 'fxGreen', 'fxBlue'],
    strength: { min: 0, max: 1, value: 1, label: 'Outline alpha' },
    radius: { value: 3, label: 'Thickness / px' },
  },
  ripple: {
    label: 'Ripple',
    properties: ['fxRadius', 'fxStrength', 'fxWaveLength', 'fxSpeed'],
    center: true,
    strength: { min: 0, max: 100, value: 12, label: 'Wave amplitude / px' },
    radius: { value: 300, label: 'Wave radius / px' },
  },
  heat: {
    label: 'Heat distortion',
    properties: ['fxStrength', 'fxFrequency', 'fxWaveLength'],
    strength: { min: 0, max: 40, value: 8, label: 'Distortion / px' },
    radius: { value: 80, label: 'Radius / px' },
  },
  color: {
    label: 'Color adjustment',
    properties: ['fxBrightness', 'fxContrast', 'fxSaturation', 'fxHue'],
    strength: { min: 0, max: 1, value: 1, label: 'Mix' },
    radius: { value: 80, label: 'Radius / px' },
  },
};

export function effectParameter(
  stage: BuildingAnimationStage | undefined,
  property: AnimationEffectProperty,
): { label: string; value: number; min: number; max: number; step: number } {
  const base = animationEffectParameters[property];
  const filter =
    stage?.kind === 'filter' && stage.filterType
      ? animationFilterCatalog[stage.filterType]
      : undefined;
  if (filter && property === 'fxStrength') return { ...base, ...filter.strength };
  if (filter && property === 'fxRadius') return { ...base, ...filter.radius };
  if (stage?.kind === 'ring' && property === 'fxSoftness')
    return { ...base, label: 'Ring thickness / px', min: 0.1, max: 128, value: 3 };
  if (property === 'fxStrength' && stage && stage.kind !== 'filter') return { ...base, min: 0 };
  return base;
}

export function isImageStage(stage: BuildingAnimationStage): boolean {
  return stage.kind === undefined || stage.kind === 'image';
}

export function effectProperties(stage: BuildingAnimationStage): AnimationEffectProperty[] {
  if (stage.kind === 'particles')
    return [
      'fxRate',
      'fxLifetime',
      'fxSpeed',
      'fxSpread',
      'fxDirection',
      'fxGravity',
      'fxGravityAngle',
      'fxSize',
      'fxEmitterRadius',
      'fxEmitterWidth',
      'fxEmitterHeight',
      'fxWind',
      'fxTurbulence',
      'fxFlicker',
      'fxStretch',
      'fxTrail',
      'fxFrameRate',
      'fxRed',
      'fxGreen',
      'fxBlue',
    ];
  if (stage.kind === 'light' || stage.kind === 'ring')
    return ['fxRadius', 'fxStrength', 'fxSoftness', 'fxRed', 'fxGreen', 'fxBlue'];
  if (stage.kind === 'filter') return animationFilterCatalog[stage.filterType!]?.properties ?? [];
  return [];
}

export function stageTrackProperties(
  stage: BuildingAnimationStage,
): BuildingAnimationTrackProperty[] {
  const transform: BuildingAnimationTrackProperty[] =
    stage.kind === 'filter'
      ? animationFilterCatalog[stage.filterType!]?.center
        ? ['x', 'y', 'opacity']
        : ['opacity']
      : ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity', 'skewX', 'skewY', 'pivotX', 'pivotY'];
  return [...transform, ...effectProperties(stage)];
}

/** A filter is always displayed immediately below its resource, in filter-stack order. */
export function animationLayerEntries(config: BuildingAnimationConfig) {
  const entries = config.stages
    .map((stage, index) => ({ stage, index }))
    .sort((a, b) => a.stage.layerOrder - b.stage.layerOrder);
  const children = new Map<string, typeof entries>();
  for (const entry of entries)
    if (entry.stage.parentId) {
      const group = children.get(entry.stage.parentId) ?? [];
      group.push(entry);
      children.set(entry.stage.parentId, group);
    }
  return entries
    .filter(({ stage }) => stage.kind !== 'filter')
    .flatMap((entry) => [entry, ...(children.get(entry.stage.id) ?? [])]);
}

export function normalizeAnimationLayers(config: BuildingAnimationConfig): void {
  animationLayerEntries(config).forEach(({ stage }, index) => {
    stage.layerOrder = index;
  });
}

/** Reorder resources together with their effects; effects can only reorder among siblings. */
export function reorderAnimationLayer(
  config: BuildingAnimationConfig,
  sourceId: string,
  targetId: string,
): void {
  const source = config.stages.find((stage) => stage.id === sourceId);
  const target = config.stages.find((stage) => stage.id === targetId);
  if (!source || !target || source.locked || sourceId === targetId) return;
  const entries = animationLayerEntries(config);
  if (source.kind === 'filter') {
    if (target.kind !== 'filter' || target.parentId !== source.parentId) return;
    const order = entries.map(({ stage }) => stage);
    order.splice(order.indexOf(source), 1);
    order.splice(
      entries.findIndex(({ stage }) => stage.id === targetId),
      0,
      source,
    );
    order.forEach((stage, index) => {
      stage.layerOrder = index;
    });
  } else {
    const targetRoot = target.parentId ?? target.id;
    const roots = entries.filter(({ stage }) => stage.kind !== 'filter').map(({ stage }) => stage);
    const from = roots.indexOf(source);
    const to = roots.findIndex((stage) => stage.id === targetRoot);
    if (from === to || to < 0) return;
    roots.splice(from, 1);
    roots.splice(to, 0, source);
    let order = 0;
    for (const root of roots) {
      root.layerOrder = order++;
      for (const { stage } of entries)
        if (stage.kind === 'filter' && stage.parentId === root.id) stage.layerOrder = order++;
    }
  }
}

export function createAnimationEffectStage(
  config: BuildingAnimationConfig,
  id: string,
  kind: Exclude<AnimationMediaKind, 'image'>,
  variant: AnimationParticlePreset | AnimationFilterType = 'sparks',
  parentId?: string,
  progress = 0,
): BuildingAnimationStage {
  const parent = config.stages.find((stage) => stage.id === parentId && stage.kind !== 'filter');
  if (kind === 'filter' && !parent) throw new Error('Select a resource before adding an effect.');
  const stage: BuildingAnimationStage = {
    id,
    kind,
    name:
      kind === 'light'
        ? 'Aura'
        : kind === 'ring'
          ? 'Shockwave ring'
          : kind === 'filter'
            ? animationFilterCatalog[variant as AnimationFilterType].label
            : variant[0]!.toUpperCase() + variant.slice(1),
    assetId: `procedural/${id}`,
    milestone: 0,
    inPoint:
      kind === 'filter'
        ? Math.max(parent!.inPoint, Math.min(parent!.outPoint - 0.00001, progress))
        : Math.max(
            0,
            Math.min(
              1 - 1 / (config.timeline.frameRate * config.timeline.durationSeconds),
              progress,
            ),
          ),
    outPoint: parent?.outPoint ?? 1,
    layerOrder: config.stages.length,
    x: config.origin.x,
    y: config.origin.y - config.alphaBounds.height * 0.25,
    scale: 1,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    skewX: 0,
    skewY: 0,
    pivotX: 0,
    pivotY: 0,
    color: variant === 'smoke' ? '#b6c3d2' : '#ffb454',
    seed: 1,
    enabled: true,
    coordinateSpace: 'composition',
    particleSpace: 'composition',
    gravitySpace: 'composition',
    emissionMode: 'continuous',
    endBehavior: 'tail',
    burstCount: 24,
    prewarmSeconds: 0,
    particleBudget: 600,
    emitterShape: 'point',
    blendMode: variant === 'smoke' ? 'normal' : 'add',
    sizeCurve: [
      { age: 0, value: 1 },
      { age: 1, value: variant === 'smoke' ? 3 : 0.3 },
    ],
    alphaCurve: [
      { age: 0, value: variant === 'smoke' ? 0 : 1 },
      { age: 0.15, value: variant === 'smoke' ? 0.22 : 0.85 },
      { age: 1, value: 0 },
    ],
    colorCurve: [],
    spriteColumns: 1,
    spriteRows: 1,
    emissionStart: progress,
    ...(kind === 'filter'
      ? { parentId: parent!.id, filterType: variant as AnimationFilterType }
      : {}),
    ...(kind === 'particles' ? { particlePreset: variant as AnimationParticlePreset } : {}),
  };
  stage.emissionStart = stage.inPoint;
  for (const property of effectProperties(stage))
    stage[property] = effectParameter(stage, property).value;
  if (kind === 'filter') {
    stage.fxRadius = animationFilterCatalog[variant as AnimationFilterType].radius.value;
    stage.fxStrength = animationFilterCatalog[variant as AnimationFilterType].strength.value;
  }
  if (variant === 'smoke')
    Object.assign(stage, {
      fxSpeed: 35,
      fxGravity: -12,
      fxSize: 16,
      fxLifetime: 3,
      fxSpread: 35,
      fxTurbulence: 12,
      fxWind: 8,
    });
  if (variant === 'embers')
    Object.assign(stage, {
      fxSpeed: 45,
      fxGravity: -18,
      fxSize: 3,
      fxLifetime: 2.5,
      fxSpread: 140,
      fxFlicker: 0.5,
      fxTurbulence: 8,
    });
  const color = Number.parseInt(stage.color!.slice(1), 16);
  stage.fxRed = color >> 16;
  stage.fxGreen = (color >> 8) & 255;
  stage.fxBlue = color & 255;
  return stage;
}

export function animationTextureAssets(config: BuildingAnimationConfig): string[] {
  return [
    ...new Set(
      config.stages.flatMap((stage) =>
        isImageStage(stage)
          ? [stage.assetId]
          : stage.particleTextureId
            ? [stage.particleTextureId]
            : [],
      ),
    ),
  ];
}

export function particleTailSeconds(
  config: BuildingAnimationConfig,
  stage: BuildingAnimationStage,
): number {
  if (stage.kind !== 'particles' || stage.endBehavior === 'cut') return 0;
  const track = config.tracks.find(
    (item) => item.stageId === stage.id && item.property === 'fxLifetime',
  );
  const lifetime = Math.max(
    stage.fxLifetime ?? 1.4,
    ...(track?.keys.map((key) => key.value) ?? []),
  );
  return stage.endBehavior === 'fade' ? Math.min(0.5, lifetime) : lifetime;
}

export function removeAnimationLayers(
  config: BuildingAnimationConfig,
  ids: readonly string[],
): void {
  const removed = new Set(ids);
  if (config.stages.some((stage) => stage.locked && removed.has(stage.id))) return;
  for (const stage of config.stages)
    if (stage.parentId && removed.has(stage.parentId)) removed.add(stage.id);
  config.stages = config.stages.filter((stage) => !removed.has(stage.id));
  config.tracks = config.tracks.filter((track) => !removed.has(track.stageId));
  config.transitions = config.transitions.filter(
    (transition) => !removed.has(transition.fromStageId) && !removed.has(transition.toStageId),
  );
  for (const stage of config.stages)
    if (stage.shapeSourceId && removed.has(stage.shapeSourceId)) delete stage.shapeSourceId;
  normalizeAnimationLayers(config);
}
