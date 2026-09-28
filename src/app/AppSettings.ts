import type { GameConfig } from '../game/config/GameConfig';
import { cloneConfig, defaultGameConfig, validateConfig } from '../game/config/defaultGameConfig';
import { cameraZoom } from '../game/client/CameraController';
import { defaultDebugOptions, type DebugOptions } from '../game/rendering/DebugOptions';
import {
  createShaderSettings,
  shaderDefinitions,
  withShaderValue,
  type ShaderSettings,
} from '../game/rendering/ShaderSettings';
import {
  defaultTerrainSmoothingSettings,
  isTerrainSmoothingQuality,
  type TerrainSmoothingSettings,
} from '../game/rendering/TerrainSmoothingSettings';
import {
  defaultTerrainTextureSettings,
  isTerrainRockTextureId,
  isTerrainTextureOrientation,
  type TerrainTextureSettings,
} from '../game/rendering/TerrainTextureSettings';

export const appSettingsUrl = '/api/settings';

export interface AppSettings {
  version: 1;
  gameConfig: GameConfig;
  debug: DebugOptions;
  shaders: ShaderSettings;
  terrainSmoothing: TerrainSmoothingSettings;
  terrainTexture: TerrainTextureSettings;
  cameraZoom: number;
}

export function createDefaultAppSettings(): AppSettings {
  return {
    version: 1,
    gameConfig: cloneConfig(),
    debug: { ...defaultDebugOptions },
    shaders: createShaderSettings(),
    terrainSmoothing: { ...defaultTerrainSmoothingSettings },
    terrainTexture: { ...defaultTerrainTextureSettings },
    cameraZoom: cameraZoom.default,
  };
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readGameConfig(value: unknown): GameConfig {
  const input = record(value);
  const defaults = cloneConfig(defaultGameConfig);
  const section = <K extends keyof GameConfig>(key: K): GameConfig[K] =>
    ({
      ...(defaults[key] as object),
      ...(record(input[key]) as object),
    }) as GameConfig[K];
  const damagePopup = section('damagePopup');
  damagePopup.velocityCurve = {
    control1: {
      ...defaults.damagePopup.velocityCurve.control1,
      ...record(record(record(input.damagePopup).velocityCurve).control1),
    },
    control2: {
      ...defaults.damagePopup.velocityCurve.control2,
      ...record(record(record(input.damagePopup).velocityCurve).control2),
    },
  };
  return validateConfig({
    simulation: section('simulation'),
    world: section('world'),
    physics: section('physics'),
    rts: section('rts'),
    movement: section('movement'),
    damagePopup,
    weaponOverrides: record(input.weaponOverrides),
    terrain: section('terrain'),
    cannon: section('cannon'),
    preview: section('preview'),
  } as GameConfig);
}

export function normalizeAppSettings(value: unknown): AppSettings {
  const defaults = createDefaultAppSettings();
  const input = record(value);
  const debugInput = record(input.debug);
  const debug = { ...defaults.debug };
  for (const key of Object.keys(debug) as (keyof DebugOptions)[])
    if (typeof debugInput[key] === 'boolean') debug[key] = debugInput[key];

  const shaderInput = record(input.shaders);
  const effectsInput = record(shaderInput.effects);
  let shaders = defaults.shaders;
  if (typeof shaderInput.enabled === 'boolean')
    shaders = { ...shaders, enabled: shaderInput.enabled };
  for (const definition of shaderDefinitions) {
    const effectInput = record(effectsInput[definition.id]);
    const values = record(effectInput.values);
    if (typeof effectInput.enabled === 'boolean') {
      shaders = {
        ...shaders,
        effects: {
          ...shaders.effects,
          [definition.id]: { ...shaders.effects[definition.id], enabled: effectInput.enabled },
        },
      };
    }
    for (const control of definition.controls) {
      const value = values[control.key];
      if (typeof value === 'number')
        shaders = withShaderValue(shaders, definition.id, control.key, value);
    }
  }

  const smoothingInput = record(input.terrainSmoothing);
  const smoothingQuality = smoothingInput.quality;
  const terrainSmoothing = {
    enabled:
      typeof smoothingInput.enabled === 'boolean'
        ? smoothingInput.enabled
        : defaults.terrainSmoothing.enabled,
    quality:
      typeof smoothingQuality === 'number' && isTerrainSmoothingQuality(smoothingQuality)
        ? smoothingQuality
        : defaults.terrainSmoothing.quality,
  };
  const textureInput = record(input.terrainTexture);
  const rockTextureId = textureInput.rockTextureId;
  const orientation = textureInput.orientation;
  const terrainTexture: TerrainTextureSettings = {
    rockTextureId:
      typeof rockTextureId === 'string' && isTerrainRockTextureId(rockTextureId)
        ? rockTextureId
        : defaults.terrainTexture.rockTextureId,
    orientation:
      typeof orientation === 'string' && isTerrainTextureOrientation(orientation)
        ? orientation
        : defaults.terrainTexture.orientation,
  };
  const zoom = input.cameraZoom;
  return {
    version: 1,
    gameConfig: readGameConfig(input.gameConfig),
    debug,
    shaders,
    terrainSmoothing,
    terrainTexture,
    cameraZoom:
      typeof zoom === 'number' && Number.isFinite(zoom)
        ? Math.min(cameraZoom.max, Math.max(cameraZoom.min, zoom))
        : defaults.cameraZoom,
  };
}

export async function loadAppSettings(): Promise<AppSettings> {
  try {
    const response = await fetch(appSettingsUrl);
    if (!response.ok) return createDefaultAppSettings();
    return normalizeAppSettings(await response.json());
  } catch {
    return createDefaultAppSettings();
  }
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  await fetch(appSettingsUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings, null, 2),
  });
}
