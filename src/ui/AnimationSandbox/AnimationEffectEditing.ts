import type {
  BuildingAnimationConfig,
  BuildingAnimationStage,
  BuildingAnimationTrackProperty,
} from '../../game/buildings/BuildingAnimationConfig';
import {
  createAnimationEffectStage,
  isImageStage,
  normalizeAnimationLayers,
  type AnimationEffectPreset,
} from '../../game/buildings/BuildingAnimationEffects';
import {
  sampleAnimationResource,
  inverseAnimationPoint,
  transformAnimationPoint,
  resourceMatrix,
} from '../../game/buildings/BuildingAnimationTransform';

/** Convert every authored center key, preserving its position in the preview. */
export function changeEffectCenterSpace(
  config: BuildingAnimationConfig,
  stage: BuildingAnimationStage,
  space: 'local' | 'composition',
  progress: number,
): void {
  if (stage.kind !== 'filter' || !stage.parentId || stage.coordinateSpace === space) return;
  const convert = space === 'local' ? inverseAnimationPoint : transformAnimationPoint;
  const tracks = config.tracks.filter(
    (track) => track.stageId === stage.id && ['x', 'y'].includes(track.property),
  );
  const times = [...new Set(tracks.flatMap((track) => track.keys.map((key) => key.time)))].sort(
    (a, b) => a - b,
  );
  const points = times.map((time) =>
    convert(
      resourceMatrix(config, stage.parentId!, time),
      sampleAnimationResource(config, stage, time),
    ),
  );
  const base = convert(resourceMatrix(config, stage.parentId, progress), stage);
  for (const property of ['x', 'y'] as const) {
    stage[property] = base[property];
    if (times.length) {
      const track = tracks.find((track) => track.property === property);
      const keys = times.map((time, index) => {
        const original =
          track?.keys.find((key) => key.time === time) ??
          tracks.flatMap((track) => track.keys).find((key) => key.time === time)!;
        return {
          ...structuredClone(original),
          id: track?.keys.find((key) => key.time === time)?.id ?? `key-${crypto.randomUUID()}`,
          time,
          value: points[index]![property],
        };
      });
      if (track) track.keys = keys;
      else config.tracks.push({ stageId: stage.id, property, keys });
    }
  }
  stage.coordinateSpace = space;
}

/** Move a resource with its keys and attached effects, constrained as one group. */
export function moveAnimationClip(
  config: BuildingAnimationConfig,
  id: string,
  delta: number,
): void {
  const root = config.stages.find((stage) => stage.id === id);
  if (!root || root.locked) return;
  const stages = config.stages.filter((stage) => stage.id === id || stage.parentId === id),
    ids = new Set(stages.map((stage) => stage.id));
  const times = [
    ...stages.flatMap((stage) => [stage.inPoint, stage.outPoint]),
    ...config.tracks
      .filter((track) => ids.has(track.stageId))
      .flatMap((track) => track.keys.map((key) => key.time)),
  ];
  const phases = stages.flatMap((stage) =>
    stage.emissionStart === undefined ? [] : [stage.emissionStart],
  );
  const offset = Math.max(
    -Math.min(...times),
    ...phases.map((time) => -1 - time),
    Math.min(1 - Math.max(...times), ...phases.map((time) => 1 - time), delta),
  );
  for (const stage of stages) {
    const previousIn = stage.inPoint;
    stage.inPoint += offset;
    stage.outPoint += offset;
    if (stage.emissionStart !== undefined || stage.kind === 'particles')
      stage.emissionStart = (stage.emissionStart ?? previousIn) + offset;
  }
  for (const track of config.tracks)
    if (ids.has(track.stageId)) for (const key of track.keys) key.time += offset;
}
function newId() {
  return `fx-${crypto.randomUUID()}`;
}
export function duplicateAnimationResource(
  config: BuildingAnimationConfig,
  id: string,
): string | undefined {
  const root = config.stages.find((stage) => stage.id === id);
  if (!root || root.locked || isImageStage(root)) return;
  const selected = config.stages.filter((stage) => stage.id === id || stage.parentId === id);
  const ids = new Map(selected.map((stage) => [stage.id, newId()]));
  for (const original of selected) {
    const stage = structuredClone(original);
    stage.id = ids.get(original.id)!;
    stage.assetId = `procedural/${stage.id}`;
    stage.name = `${stage.name} copy`;
    stage.solo = false;
    stage.locked = false;
    if (stage.parentId && ids.has(stage.parentId)) stage.parentId = ids.get(stage.parentId)!;
    stage.layerOrder = config.stages.length;
    config.stages.push(stage);
  }
  for (const track of [...config.tracks])
    if (ids.has(track.stageId))
      config.tracks.push({
        ...structuredClone(track),
        stageId: ids.get(track.stageId)!,
        keys: track.keys.map((key) => ({
          ...structuredClone(key),
          id: `key-${crypto.randomUUID()}`,
        })),
      });
  normalizeAnimationLayers(config);
  return ids.get(id);
}
export function captureAnimationPreset(
  config: BuildingAnimationConfig,
  id: string,
  name: string,
): AnimationEffectPreset | undefined {
  const root = config.stages.find((stage) => stage.id === id);
  if (!root) return;
  const stages = structuredClone(
      config.stages.filter((stage) => stage.id === id || stage.parentId === id),
    ),
    ids = new Set(stages.map((stage) => stage.id));
  const tracks = structuredClone(config.tracks.filter((track) => ids.has(track.stageId)));
  const start = Math.min(
    ...stages.map((stage) => stage.inPoint),
    ...stages
      .filter((stage) => stage.kind === 'particles')
      .map((stage) => stage.emissionStart ?? stage.inPoint),
    ...tracks.flatMap((track) => track.keys.map((key) => key.time)),
  );
  const end = Math.max(
      ...stages.map((stage) => stage.outPoint),
      ...tracks.flatMap((track) => track.keys.map((key) => key.time)),
    ),
    span = Math.max(0.0001, end - start);
  for (const stage of stages) {
    stage.milestone = 0;
    stage.inPoint = (stage.inPoint - start) / span;
    stage.outPoint = (stage.outPoint - start) / span;
    stage.layerOrder = stages.indexOf(stage);
    stage.hidden = false;
    stage.solo = false;
    stage.locked = false;
    if (stage.emissionStart !== undefined)
      stage.emissionStart = (stage.emissionStart - start) / span;
    if (stage.shapeSourceId && !ids.has(stage.shapeSourceId)) delete stage.shapeSourceId;
  }
  for (const track of tracks) for (const key of track.keys) key.time = (key.time - start) / span;
  return {
    id: newId(),
    name: name.trim() || root.name,
    durationSeconds: span * config.timeline.durationSeconds,
    stages,
    tracks,
  };
}
export function applyAnimationPreset(
  config: BuildingAnimationConfig,
  preset: AnimationEffectPreset,
  progress: number,
  parentId?: string,
): string | undefined {
  const root = preset.stages.find((stage) => stage.kind !== 'filter'),
    image = root && isImageStage(root);
  const parent = config.stages.find((stage) => stage.id === parentId && stage.kind !== 'filter');
  if ((image || !root) && (!parent || parent.locked)) return;
  const start = Math.max(
    0,
    Math.min(1 - 1 / (config.timeline.durationSeconds * config.timeline.frameRate), progress),
  );
  const scale = Math.min(
    1 - start,
    (preset.durationSeconds ?? config.timeline.durationSeconds) / config.timeline.durationSeconds,
  );
  const ids = new Map(preset.stages.map((stage) => [stage.id, newId()]));
  if (image && root) ids.set(root.id, parent!.id);
  let added: string | undefined;
  for (const original of preset.stages) {
    if (image && original.id === root.id) continue;
    const stage = structuredClone(original);
    stage.id = ids.get(original.id)!;
    stage.assetId = `procedural/${stage.id}`;
    stage.inPoint = start + original.inPoint * scale;
    stage.outPoint = start + original.outPoint * scale;
    stage.milestone = 0;
    stage.layerOrder = config.stages.length;
    if (stage.emissionStart !== undefined)
      stage.emissionStart = start + stage.emissionStart * scale;
    if (stage.kind === 'filter') stage.parentId = ids.get(original.parentId ?? '') ?? parent!.id;
    if (
      stage.emitterShape === 'contour' &&
      !config.stages.some((item) => item.id === stage.shapeSourceId && isImageStage(item))
    )
      stage.shapeSourceId =
        parent && isImageStage(parent) ? parent.id : config.stages.find(isImageStage)?.id;
    config.stages.push(stage);
    added ??= stage.id;
  }
  for (const track of preset.tracks) {
    if (image && track.stageId === root.id) continue;
    config.tracks.push({
      stageId: ids.get(track.stageId)!,
      property: track.property,
      keys: track.keys.map((key) => ({
        ...structuredClone(key),
        id: `key-${crypto.randomUUID()}`,
        time: start + key.time * scale,
      })),
    });
  }
  normalizeAnimationLayers(config);
  return added;
}
export const builtinEffectPresets = [
  { id: 'shot', name: 'Выстрел' },
  { id: 'impact', name: 'Попадание' },
  { id: 'damage', name: 'Дым повреждения' },
  { id: 'construction', name: 'Контур строительства' },
  { id: 'shield', name: 'Щит' },
] as const;
export function addBuiltinEffectPreset(
  config: BuildingAnimationConfig,
  type: string,
  progress: number,
  parentId?: string,
): string | undefined {
  const parent = config.stages.find((stage) => stage.id === parentId && stage.kind !== 'filter');
  if ((type === 'construction' || type === 'shield') && (!parent || parent.locked)) return;
  if (type === 'construction' && parent && !isImageStage(parent)) return;
  const add = (
    kind: Parameters<typeof createAnimationEffectStage>[2],
    variant?: Parameters<typeof createAnimationEffectStage>[3],
    seconds?: number,
  ) => {
    const stage = createAnimationEffectStage(
      config,
      newId(),
      kind,
      variant,
      kind === 'filter' ? parent?.id : undefined,
      progress,
    );
    if (seconds !== undefined)
      stage.outPoint = Math.min(1, stage.inPoint + seconds / config.timeline.durationSeconds);
    config.stages.push(stage);
    return stage;
  };
  const animate = (
    stage: BuildingAnimationStage,
    property: BuildingAnimationTrackProperty,
    from: number,
    to: number,
  ) =>
    config.tracks.push({
      stageId: stage.id,
      property,
      keys: [
        {
          id: newId(),
          time: stage.inPoint,
          value: from,
          interpolation: 'ease-out',
          bezier: [0.4, 0, 0.2, 1],
        },
        {
          id: newId(),
          time: stage.outPoint,
          value: to,
          interpolation: 'linear',
          bezier: [0.4, 0, 0.2, 1],
        },
      ],
    });
  let root: BuildingAnimationStage;
  if (type === 'shot' || type === 'impact') {
    root = add('particles', 'sparks', 0.08);
    Object.assign(root, {
      emissionMode: 'burst',
      burstCount: type === 'shot' ? 28 : 70,
      fxLifetime: 0.6,
      fxSpeed: type === 'shot' ? 450 : 280,
      fxDirection: type === 'shot' ? 0 : -90,
      fxSpread: type === 'shot' ? 25 : 330,
      fxTrail: 0.04,
      fxStretch: 2,
    });
    const light = add('light', undefined, 0.22);
    animate(light, 'opacity', 1, 0);
    animate(light, 'fxRadius', 16, 100);
    if (type === 'impact') {
      const ring = add('ring', undefined, 0.7);
      animate(ring, 'fxRadius', 1, 200);
      animate(ring, 'opacity', 0.9, 0);
    }
  } else if (type === 'damage') {
    root = add('particles', 'smoke');
    Object.assign(root, {
      fxRate: 18,
      fxLifetime: 4,
      prewarmSeconds: 2,
      fxSpeed: 25,
      fxTurbulence: 18,
      fxWind: 15,
      emitterShape: 'circle',
      fxEmitterRadius: 12,
    });
  } else if (type === 'construction') {
    root = add('particles', 'embers');
    Object.assign(root, {
      emitterShape: 'contour',
      shapeSourceId: parent!.id,
      fxSpeed: 12,
      fxGravity: -4,
      fxLifetime: 1.8,
      fxRed: 90,
      fxGreen: 220,
      fxBlue: 255,
    });
    const outline = add('filter', 'outline');
    Object.assign(outline, { fxRed: 90, fxGreen: 220, fxBlue: 255 });
    animate(outline, 'opacity', 1, 0);
  } else {
    root = add('filter', 'glow');
    Object.assign(root, { fxRed: 80, fxGreen: 160, fxBlue: 255, fxRadius: 25, fxStrength: 1.8 });
    const ripple = add('filter', 'ripple');
    ripple.coordinateSpace = 'local';
    ripple.x = isImageStage(parent!) ? config.alphaBounds.x + config.alphaBounds.width / 2 : 0;
    ripple.y = isImageStage(parent!) ? config.alphaBounds.y + config.alphaBounds.height / 2 : 0;
    ripple.fxRadius = 300;
  }
  normalizeAnimationLayers(config);
  return root.id;
}
