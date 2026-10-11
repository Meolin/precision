import type {
  BuildingAnimationConfig,
  BuildingAnimationStage,
  BuildingAnimationTrackProperty,
} from './BuildingAnimationConfig';
import { defaultTrackValue, sampleBuildingTrack } from './BuildingAnimationKeyframes';
import { isImageStage } from './BuildingAnimationEffects';
import { sampleBuildingTransition } from './BuildingAnimationTransitions';

export function sampleAnimationResource(
  config: BuildingAnimationConfig,
  stage: BuildingAnimationStage,
  progress: number,
): BuildingAnimationStage {
  const result = { ...stage };
  for (const track of config.tracks)
    if (track.stageId === stage.id)
      result[track.property] = sampleBuildingTrack(
        track,
        progress,
        defaultTrackValue(stage, track.property),
      );
  return result;
}
export interface AnimationMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  x: number;
  y: number;
}
export function resourceMatrix(
  config: BuildingAnimationConfig,
  stageId: string,
  progress: number,
): AnimationMatrix {
  const original = config.stages.find((stage) => stage.id === stageId)!;
  const stage = sampleAnimationResource(config, original, progress);
  const matrix = (pose: BuildingAnimationStage): AnimationMatrix => {
    const r = (pose.rotation * Math.PI) / 180,
      sx = (pose.skewX * Math.PI) / 180,
      sy = (pose.skewY * Math.PI) / 180;
    const a = Math.cos(r + sy) * pose.scaleX,
      b = Math.sin(r + sy) * pose.scaleX;
    const c = -Math.sin(r - sx) * pose.scaleY,
      d = Math.cos(r - sx) * pose.scaleY;
    return {
      a,
      b,
      c,
      d,
      x: pose.x - a * pose.pivotX - c * pose.pivotY,
      y: pose.y - b * pose.pivotX - d * pose.pivotY,
    };
  };
  const before = matrix(stage);
  if (!isImageStage(stage)) return before;
  const images = config.stages.filter(isImageStage);
  let index = 0;
  images.forEach((image, i) => {
    if (image.milestone <= progress) index = i;
  });
  const from = images[index],
    to = images[index + 1];
  const transition = config.transitions.find(
    (item) => item.fromStageId === from?.id && item.toStageId === to?.id,
  );
  if (!from || !to || !transition || (stageId !== from.id && stageId !== to.id)) return before;
  const sample = sampleBuildingTransition(
    transition,
    (progress - from.milestone) / Math.max(0.0001, to.milestone - from.milestone),
  );
  const pose = stageId === from.id ? sample.outgoing : sample.incoming;
  stage.scaleX *= pose.scaleX;
  stage.scaleY *= pose.scaleY;
  stage.rotation += pose.rotation;
  const after = matrix(stage);
  const center = {
    x: config.canvas.width * transition.centerX,
    y: config.canvas.height * transition.centerY,
  };
  const p = transformAnimationPoint(before, center),
    q = transformAnimationPoint(after, center);
  after.x += p.x - q.x + pose.x * config.canvas.width;
  after.y += p.y - q.y + pose.y * config.canvas.height;
  return after;
}
export function transformAnimationPoint(m: AnimationMatrix, point: { x: number; y: number }) {
  return { x: m.a * point.x + m.c * point.y + m.x, y: m.b * point.x + m.d * point.y + m.y };
}
export function inverseAnimationPoint(m: AnimationMatrix, point: { x: number; y: number }) {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-8) return { x: 0, y: 0 };
  return {
    x: (m.d * (point.x - m.x) - m.c * (point.y - m.y)) / det,
    y: (-m.b * (point.x - m.x) + m.a * (point.y - m.y)) / det,
  };
}
export function effectOrigin(
  config: BuildingAnimationConfig,
  stage: BuildingAnimationStage,
  progress: number,
) {
  const sampled = sampleAnimationResource(config, stage, progress);
  if (stage.kind === 'filter' && stage.coordinateSpace === 'local' && stage.parentId)
    return transformAnimationPoint(resourceMatrix(config, stage.parentId, progress), sampled);
  return stage.kind === 'filter'
    ? { x: sampled.x, y: sampled.y }
    : transformAnimationPoint(resourceMatrix(config, stage.id, progress), { x: 0, y: 0 });
}
export function animationColor(
  sample: (property: BuildingAnimationTrackProperty) => number,
): number {
  return (
    (Math.round(sample('fxRed')) << 16) |
    (Math.round(sample('fxGreen')) << 8) |
    Math.round(sample('fxBlue'))
  );
}
export function animationResourceEnabled(
  config: BuildingAnimationConfig,
  stage: BuildingAnimationStage,
): boolean {
  const parent = stage.parentId
    ? config.stages.find((item) => item.id === stage.parentId)
    : undefined;
  if (stage.enabled === false || stage.hidden || parent?.hidden || parent?.enabled === false)
    return false;
  const solos = config.stages.filter((item) => item.solo && !item.hidden);
  return (
    !solos.length ||
    stage.solo === true ||
    parent?.solo === true ||
    solos.some((item) => item.parentId === stage.id)
  );
}
