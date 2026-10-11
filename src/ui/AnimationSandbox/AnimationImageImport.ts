import type {
  BuildingAnimationBounds,
  BuildingAnimationConfig,
  BuildingAnimationStage,
} from '../../game/buildings/BuildingAnimationConfig';
import {
  isImageStage,
  normalizeAnimationLayers,
} from '../../game/buildings/BuildingAnimationEffects';
import { createDefaultBuildingTransition } from '../../game/buildings/BuildingAnimationTransitions';

export interface AnimationImageSource {
  name: string;
  width: number;
  height: number;
  bounds: BuildingAnimationBounds;
}

/** Adding artwork preserves existing timing, keys and canvas. Replacement is explicit. */
export function importAnimationImages(
  original: BuildingAnimationConfig,
  images: AnimationImageSource[],
  animationId: string,
  mode: 'add' | 'replace',
  reservedAssetIds: Iterable<string> = [],
): { config: BuildingAnimationConfig; stages: BuildingAnimationStage[] } {
  if (!images.length) throw new Error('Выберите хотя бы один PNG.');
  const config = structuredClone(original);
  const existingImages = config.stages.filter(isImageStage);
  const lastMilestone = mode === 'add' ? (existingImages.at(-1)?.milestone ?? 0) : 0;
  if (mode === 'add' && existingImages.length && lastMilestone >= 0.999)
    throw new Error(
      'Нет места для новой стадии. Увеличьте длительность анимации перед добавлением.',
    );
  const assetIds = new Set([...reservedAssetIds, ...config.stages.map((stage) => stage.assetId)]);
  const ids = new Set(config.stages.map((stage) => stage.id));
  const stages: BuildingAnimationStage[] = images.map((image, index) => {
    const base =
      image.name
        .replace(/\.[^.]+$/, '')
        .toLowerCase()
        .replace(/[^a-z0-9а-яё]+/gi, '-')
        .replace(/^-|-$/g, '') || 'stage';
    let suffix = 1;
    let assetId = `buildings/${animationId}/${base}.png`;
    while (assetIds.has(assetId)) assetId = `buildings/${animationId}/${base}-${++suffix}.png`;
    assetIds.add(assetId);
    let id = `stage-${base}`;
    suffix = 1;
    while (ids.has(id)) id = `stage-${base}-${++suffix}`;
    ids.add(id);
    const milestone =
      mode === 'add' && existingImages.length
        ? lastMilestone + ((1 - lastMilestone) * (index + 1)) / (images.length + 1)
        : images.length === 1
          ? 0
          : (index / (images.length - 1)) * 0.85;
    return {
      id,
      name: image.name,
      assetId,
      milestone,
      inPoint: 0,
      outPoint: 1,
      layerOrder: images.length - 1 - index,
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
    stage.inPoint = stages[index - 1]?.milestone ?? lastMilestone;
    stage.outPoint = stages[index + 1]?.milestone ?? 1;
  }
  if (mode === 'add') {
    config.stages.forEach((stage) => {
      stage.layerOrder += stages.length;
    });
    config.stages = [...config.stages, ...stages];
  } else {
    const procedural = config.stages.filter(
      (stage) =>
        !isImageStage(stage) &&
        (stage.kind !== 'filter' ||
          config.stages.some((parent) => parent.id === stage.parentId && !isImageStage(parent))),
    );
    config.stages = [...stages, ...procedural];
    // A preserved emitter cannot keep a contour reference to artwork that was replaced.
    for (const stage of procedural) {
      if (
        stage.shapeSourceId &&
        !config.stages.some((source) => source.id === stage.shapeSourceId)
      ) {
        stage.shapeSourceId = '';
        if (stage.emitterShape === 'contour') stage.emitterShape = 'point';
      }
    }
    procedural.forEach((stage, index) => {
      stage.layerOrder = stages.length + index;
    });
    const retained = new Set(procedural.map((stage) => stage.id));
    config.tracks = config.tracks.filter((track) => retained.has(track.stageId));
  }
  if (mode === 'replace' || !existingImages.length) {
    const final = images.at(-1)!;
    const bounds = final.bounds;
    config.canvas = { width: final.width, height: final.height };
    config.alphaBounds = { ...bounds };
    config.hitbox = { ...bounds, scaleX: 1, scaleY: 1 };
    config.origin = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height };
    config.worldSize.heightMeters = (config.worldSize.widthMeters * bounds.height) / bounds.width;
  }
  const sequence = config.stages.filter(isImageStage);
  config.transitions = sequence
    .slice(1)
    .map(
      (stage, index) =>
        config.transitions.find(
          (transition) =>
            transition.fromStageId === sequence[index]!.id && transition.toStageId === stage.id,
        ) ?? createDefaultBuildingTransition(sequence[index]!.id, stage.id),
    );
  normalizeAnimationLayers(config);
  return { config, stages };
}
