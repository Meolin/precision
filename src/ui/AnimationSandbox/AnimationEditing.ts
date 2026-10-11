import type {
  BuildingAnimationConfig,
  BuildingAnimationTrackProperty,
  BuildingAnimationStage,
} from '../../game/buildings/BuildingAnimationConfig';
import {
  defaultTrackValue,
  sampleBuildingTrack,
} from '../../game/buildings/BuildingAnimationKeyframes';
import type { BuildingAnimationPreview } from '../../game/buildings/BuildingAnimationPreview';
import {
  animationEffectParameters,
  effectParameter,
  stageTrackProperties,
  type AnimationEffectProperty,
} from '../../game/buildings/BuildingAnimationEffects';

export function renameAnimationAsset(
  preview: BuildingAnimationPreview,
  stageId: string,
  value: string,
): BuildingAnimationPreview {
  const assetId = value.trim();
  const stage = preview.config.stages.find((item) => item.id === stageId);
  if (!stage || stage.assetId === assetId) return preview;
  if (
    !assetId ||
    assetId.startsWith('blob:') ||
    preview.config.stages.some((item) => item.id !== stageId && item.assetId === assetId)
  )
    throw new Error('Asset ID must be stable, non-empty and unique.');
  const config = structuredClone(preview.config);
  config.stages.find((item) => item.id === stageId)!.assetId = assetId;
  const sourceUrls = { ...preview.sourceUrls };
  const localUrl = sourceUrls[stage.assetId];
  if (localUrl) {
    delete sourceUrls[stage.assetId];
    sourceUrls[assetId] = localUrl;
  }
  return { ...preview, config, sourceUrls, sourceRevision: preview.sourceRevision + 1 };
}

export function renameParticleTexture(
  preview: BuildingAnimationPreview,
  stageId: string,
  assetId: string | undefined,
): BuildingAnimationPreview {
  const stage = preview.config.stages.find((item) => item.id === stageId);
  if (!stage || stage.kind !== 'particles' || stage.locked || stage.particleTextureId === assetId)
    return preview;
  const config = structuredClone(preview.config);
  config.stages.find((item) => item.id === stageId)!.particleTextureId = assetId;
  const sourceUrls = { ...preview.sourceUrls },
    localUrl = stage.particleTextureId ? sourceUrls[stage.particleTextureId] : undefined;
  if (assetId && localUrl && !sourceUrls[assetId]) sourceUrls[assetId] = localUrl;
  return { ...preview, config, sourceUrls, sourceRevision: preview.sourceRevision + 1 };
}

export function snapAnimationTime(
  time: number,
  config: BuildingAnimationConfig,
  enabled: boolean,
): number {
  const step = enabled ? 1 / (config.timeline.durationSeconds * config.timeline.frameRate) : 0.0001;
  return Math.min(1, Math.max(0, Math.round(time / step) * step));
}

export function minimumAnimationDuration(config: BuildingAnimationConfig): number {
  const duration = config.timeline.durationSeconds;
  return Math.max(
    0.1,
    ...config.stages.map((stage) => stage.milestone * duration),
    ...config.stages.map((stage) => stage.inPoint * duration + 0.001),
    ...config.stages.map((stage) => Math.abs(stage.emissionStart ?? 0) * duration),
    ...config.tracks.flatMap((track) => track.keys.map((key) => key.time * duration)),
    ...config.markers.map((marker) => marker.time * duration),
    config.timeline.workAreaStart * duration + 0.001,
  );
}

/** Preserve seconds for keys, event markers and trims when resizing a composition. */
export function resizeAnimationDuration(
  config: BuildingAnimationConfig,
  seconds: number,
): BuildingAnimationConfig {
  if (!Number.isFinite(seconds) || seconds < minimumAnimationDuration(config) || seconds > 600)
    throw new Error('Duration would cut existing keys, markers or layer starts.');
  const next = structuredClone(config);
  const ratio = config.timeline.durationSeconds / seconds;
  const clamp = (value: number) => Math.max(0, Math.min(1, value * ratio));
  for (const stage of next.stages) {
    stage.milestone = clamp(stage.milestone);
    stage.inPoint = clamp(stage.inPoint);
    stage.outPoint = stage.outPoint === 1 ? 1 : clamp(stage.outPoint);
    if (stage.emissionStart !== undefined) stage.emissionStart *= ratio;
  }
  for (const track of next.tracks) for (const key of track.keys) key.time = clamp(key.time);
  for (const marker of next.markers) marker.time = clamp(marker.time);
  next.timeline.workAreaStart = clamp(next.timeline.workAreaStart);
  next.timeline.workAreaEnd =
    next.timeline.workAreaEnd === 1 ? 1 : clamp(next.timeline.workAreaEnd);
  next.timeline.durationSeconds = seconds;
  return next;
}

export function constrainAnimationValue(
  property: BuildingAnimationTrackProperty,
  value: number,
  stage?: BuildingAnimationStage,
): number {
  if (property in animationEffectParameters) {
    const range = effectParameter(stage, property as AnimationEffectProperty);
    return Math.max(range.min, Math.min(range.max, value));
  }
  if (property === 'opacity') return Math.min(1, Math.max(0, value));
  if (property === 'scaleX' || property === 'scaleY') return Math.max(0.001, value);
  return value;
}

/** Auto-key creates a track; with it off, existing tracks still edit the current key. */
export function editAnimationValue(
  config: BuildingAnimationConfig,
  stageId: string,
  property: BuildingAnimationTrackProperty,
  value: number,
  progress: number,
  snap: boolean,
  autoKey: boolean,
  createId = () => `key-${crypto.randomUUID()}`,
): void {
  if (!Number.isFinite(value)) return;
  const stage = config.stages.find((item) => item.id === stageId);
  if (!stage || stage.locked || !stageTrackProperties(stage).includes(property)) return;
  let track = config.tracks.find((item) => item.stageId === stageId && item.property === property);
  const next = constrainAnimationValue(property, value, stage);
  if (!track && !autoKey) {
    stage[property] = next;
    return;
  }
  if (!track) {
    track = { stageId, property, keys: [] };
    config.tracks.push(track);
  }
  const time = snapAnimationTime(progress, config, snap);
  const key = track.keys.find((item) => Math.abs(item.time - time) < 0.00001);
  if (key) key.value = next;
  else
    track.keys.push({
      id: createId(),
      time,
      value: next,
      interpolation: 'linear',
      bezier: [0.4, 0, 0.2, 1],
    });
  track.keys.sort((left, right) => left.time - right.time);
}

export function sampleAnimationStage(
  config: BuildingAnimationConfig,
  stageId: string,
  progress: number,
) {
  const stage = config.stages.find((item) => item.id === stageId);
  if (!stage) return undefined;
  const sampled = { ...stage };
  for (const property of stageTrackProperties(stage)) {
    sampled[property] = sampleBuildingTrack(
      config.tracks.find((item) => item.stageId === stageId && item.property === property),
      progress,
      defaultTrackValue(stage, property),
    );
  }
  return sampled;
}
