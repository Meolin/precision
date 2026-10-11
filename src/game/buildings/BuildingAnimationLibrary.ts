import {
  createDefaultBuildingAnimationConfig,
  loadBuildingAnimationConfig,
  type BuildingAnimationConfig,
} from './BuildingAnimationConfig';
import {
  animationTextureAssets,
  isImageStage,
  normalizeAnimationLayers,
} from './BuildingAnimationEffects';

export type BuildingAnimationKind = 'construction' | 'idle' | 'destruction' | 'custom';
export interface BuildingAnimationEntry {
  id: string;
  name: string;
  kind: BuildingAnimationKind;
  config: BuildingAnimationConfig;
}
export interface BuildingAnimationLibrary {
  libraryVersion: 1;
  entityId: string;
  animations: BuildingAnimationEntry[];
}

export function createAnimationVariant(
  source: BuildingAnimationConfig,
  kind: BuildingAnimationKind,
  id: string,
): BuildingAnimationConfig {
  const config = structuredClone(source);
  config.id = id;
  if (kind === 'custom' || kind === 'construction') return config;
  const sourceStage =
    config.stages.filter(isImageStage).at(-1) ??
    config.stages.find((stage) => stage.kind !== 'filter')!;
  const stage = { ...sourceStage, milestone: 0, inPoint: 0, outPoint: 1, layerOrder: 0 };
  config.stages = [
    stage,
    ...config.stages
      .filter((effect) => effect.kind === 'filter' && effect.parentId === stage.id)
      .map((effect) => ({ ...effect, inPoint: 0, outPoint: 1 })),
  ];
  normalizeAnimationLayers(config);
  config.transitions = [];
  config.sounds = [];
  config.markers = [];
  config.tracks =
    kind === 'destruction'
      ? [
          {
            stageId: stage.id,
            property: 'opacity',
            keys: [
              {
                id: `${id}-start`,
                time: 0,
                value: 1,
                interpolation: 'ease-in',
                bezier: [0.4, 0, 0.2, 1],
              },
              {
                id: `${id}-end`,
                time: 1,
                value: 0,
                interpolation: 'linear',
                bezier: [0.4, 0, 0.2, 1],
              },
            ],
          },
        ]
      : [];
  config.timeline = {
    ...config.timeline,
    durationSeconds: kind === 'idle' ? 2 : 1,
    workAreaStart: 0,
    workAreaEnd: 1,
  };
  return config;
}

export function createBuildingAnimationLibrary(
  config = createDefaultBuildingAnimationConfig(),
): BuildingAnimationLibrary {
  return {
    libraryVersion: 1,
    entityId: config.id.replace(/-construction.*$/, '') || 'building',
    animations: [
      {
        id: 'construction',
        name: 'Постройка',
        kind: 'construction',
        config: structuredClone(config),
      },
      {
        id: 'idle',
        name: 'Idle',
        kind: 'idle',
        config: createAnimationVariant(config, 'idle', `${config.id}-idle`),
      },
      {
        id: 'destruction',
        name: 'Уничтожение',
        kind: 'destruction',
        config: createAnimationVariant(config, 'destruction', `${config.id}-destruction`),
      },
    ],
  };
}

export function replaceLibraryAnimation(
  library: BuildingAnimationLibrary,
  id: string,
  config: BuildingAnimationConfig,
): BuildingAnimationLibrary {
  if (!library.animations.some((entry) => entry.id === id)) throw new Error('Unknown animation.');
  return {
    ...library,
    animations: library.animations.map((entry) => (entry.id === id ? { ...entry, config } : entry)),
  };
}

export function animationLibraryAssetIds(library: BuildingAnimationLibrary): Set<string> {
  return new Set(
    library.animations.flatMap(({ config }) => [
      ...animationTextureAssets(config),
      ...(config.effectPresets ?? []).flatMap((preset) =>
        preset.stages.flatMap((stage) =>
          isImageStage(stage)
            ? [stage.assetId]
            : stage.particleTextureId
              ? [stage.particleTextureId]
              : [],
        ),
      ),
      ...config.sounds.map((sound) => sound.assetId),
    ]),
  );
}

export function loadBuildingAnimationLibrary(value: unknown): BuildingAnimationLibrary {
  if (!value || typeof value !== 'object') throw new Error('Entity library must be an object.');
  const input = value as BuildingAnimationLibrary;
  if (
    input.libraryVersion !== 1 ||
    typeof input.entityId !== 'string' ||
    !input.entityId.trim() ||
    !Array.isArray(input.animations) ||
    !input.animations.length
  )
    throw new Error('Invalid entity animation library.');
  const ids = new Set<string>();
  const kinds = new Set<BuildingAnimationKind>();
  const animations = input.animations.map((entry) => {
    if (
      !entry ||
      typeof entry.id !== 'string' ||
      !entry.id.trim() ||
      ids.has(entry.id) ||
      typeof entry.name !== 'string' ||
      !entry.name.trim() ||
      !['construction', 'idle', 'destruction', 'custom'].includes(entry.kind)
    )
      throw new Error('Animations need unique IDs, names and a supported kind.');
    if (entry.kind !== 'custom' && kinds.has(entry.kind))
      throw new Error('Built-in animation kinds must be unique.');
    ids.add(entry.id);
    kinds.add(entry.kind);
    return {
      id: entry.id,
      name: entry.name,
      kind: entry.kind,
      config: loadBuildingAnimationConfig(entry.config),
    };
  });
  return { libraryVersion: 1, entityId: input.entityId.trim(), animations };
}
