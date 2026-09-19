export const buildingAnimationSchemaVersion = 2 as const;

export type BuildingTransitionType = 'crossfade' | 'reveal' | 'dissolve';
export type DissolveDirection = 'uniform' | 'bottom-to-top' | 'top-to-bottom' | 'center-out';
export type BuildingAnimationEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
export type BuildingAnimationBlendMode = 'normal' | 'add' | 'screen' | 'multiply' | 'overlay';
export type BuildingTextureScaleMode = 'linear' | 'nearest';

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

export interface BuildingAnimationStage {
  id: string;
  name: string;
  assetId: string;
  milestone: number;
  x: number;
  y: number;
  scale: number;
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
  transitions: BuildingAnimationTransition[];
  vfx: unknown[];
  sounds: unknown[];
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
  if (!Array.isArray(config.stages) || !Array.isArray(config.transitions))
    return { valid: false, errors: [...errors, 'Stages and transitions must be arrays.'] };
  if (!Array.isArray(config.vfx) || !Array.isArray(config.sounds))
    errors.push('vfx and sounds must be arrays.');
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
  if (config.stages.length < 2) errors.push('At least two stages are required.');

  const stageIds = new Set<string>();
  const assetIds = new Set<string>();
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
    if (stage.milestone <= previousMilestone)
      errors.push(`Stage ${index + 1} milestone must be greater than the previous milestone.`);
    previousMilestone = stage.milestone;
    if (![stage.x, stage.y, stage.scale].every(finite) || stage.scale <= 0)
      errors.push(`Stage ${index + 1} alignment is invalid.`);
  }
  if (config.stages[0]?.milestone !== 0) errors.push('The first milestone must be 0.');

  const transitionKeys = new Set(
    config.transitions.flatMap((item) =>
      item && typeof item === 'object' ? [`${item.fromStageId}:${item.toStageId}`] : [],
    ),
  );
  for (let index = 1; index < config.stages.length; index++) {
    const from = config.stages[index - 1]!;
    const to = config.stages[index]!;
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
  }
  return { valid: errors.length === 0, errors };
}

export function loadBuildingAnimationConfig(value: unknown): BuildingAnimationConfig {
  if (!value || typeof value !== 'object') throw new Error('Animation config must be an object.');
  const config = value as BuildingAnimationConfig;
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
    x: 0,
    y: 0,
    scale: 1,
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
    transitions: stages.slice(1).map((stage, index) => ({
      fromStageId: stages[index]!.id,
      toStageId: stage.id,
      type: 'dissolve',
      direction: 'bottom-to-top',
      noiseScale: 8,
      directionStrength: 0.68,
      edgeWidth: 0.08,
      edgeIntensity: 1,
      edgeColor: '#85d7e8',
      easing: 'ease-out',
      blendMode: 'normal',
    })),
    vfx: [],
    sounds: [],
  };
}
