import { clamp } from '../math/Vec2';
import { validateWeaponOverrides } from '../weapons/WeaponSettings';
import { numericSettings, settingValue, type GameConfig, type NumericSetting } from './GameConfig';

export const defaultGameConfig: GameConfig = {
  simulation: { tickRate: 60, maxFrameDeltaMs: 250 },
  world: { widthMeters: 120, heightMeters: 64, pixelsPerMeter: 20 },
  physics: { gravity: 9.81, windAcceleration: 0, airDrag: 0 },
  weaponOverrides: {},
  terrain: {
    cellSizeMeters: 0.2,
    surfaceHeightFraction: 0.7,
    waveAmplitudeMeters: 4.2,
    noiseAmplitudeMeters: 1,
    rockDepthMeters: 6,
    rockVariationMeters: 1.5,
  },
  cannon: {
    minAngleDeg: 5,
    maxAngleDeg: 85,
    barrelLengthMeters: 2.4,
    mountHeightMeters: 1.1,
    spawnXFraction: 0.17,
    aimStepDeg: 1,
  },
  preview: { maxSeconds: 20, maxPoints: 110 },
};

export function cloneConfig(config: GameConfig = defaultGameConfig): GameConfig {
  return {
    simulation: { ...config.simulation },
    world: { ...config.world },
    physics: { ...config.physics },
    weaponOverrides: Object.fromEntries(
      Object.entries(config.weaponOverrides).map(([id, overrides]) => [
        id,
        {
          weapon: { ...overrides.weapon },
          projectile: { ...overrides.projectile },
          impact: { ...overrides.impact },
          ricochet: { ...overrides.ricochet },
        },
      ]),
    ),
    terrain: { ...config.terrain },
    cannon: { ...config.cannon },
    preview: { ...config.preview },
  };
}

export function withSetting(
  config: GameConfig,
  setting: NumericSetting,
  value: number,
): GameConfig {
  if (
    !Number.isFinite(value) ||
    !numericSettings.some((item) => item.section === setting.section && item.key === setting.key)
  )
    return config;
  return { ...config, [setting.section]: { ...config[setting.section], [setting.key]: value } };
}

export function validateConfig(input: GameConfig): GameConfig {
  const config = cloneConfig(input);
  config.weaponOverrides = validateWeaponOverrides(config.weaponOverrides);
  for (const setting of numericSettings) {
    const value = settingValue(config, setting);
    const group: Record<string, number> = config[setting.section];
    group[setting.key] = Number.isFinite(value)
      ? clamp(value, setting.min, setting.max)
      : settingValue(defaultGameConfig, setting);
  }
  config.simulation.tickRate = Math.round(config.simulation.tickRate);
  const positive = [
    config.simulation.maxFrameDeltaMs,
    config.world.widthMeters,
    config.world.heightMeters,
    config.world.pixelsPerMeter,
    config.terrain.cellSizeMeters,
    config.cannon.barrelLengthMeters,
    config.cannon.mountHeightMeters,
    config.preview.maxSeconds,
    config.preview.maxPoints,
  ];
  if (positive.some((value) => !Number.isFinite(value) || value <= 0))
    throw new Error('Dimensions, clock and preview bounds must be finite and positive.');
  if (
    Math.ceil(config.world.widthMeters / config.terrain.cellSizeMeters) *
      Math.ceil(config.world.heightMeters / config.terrain.cellSizeMeters) >
    4_000_000
  )
    throw new Error('Terrain exceeds the MVP grid budget.');
  if (config.preview.maxPoints < 2) throw new Error('Preview requires at least two points.');
  if (
    (config.terrain.rockDepthMeters !== null &&
      (!Number.isFinite(config.terrain.rockDepthMeters) || config.terrain.rockDepthMeters < 0)) ||
    !Number.isFinite(config.terrain.rockVariationMeters) ||
    config.terrain.rockVariationMeters < 0
  )
    throw new Error('Rock depth and variation must be finite and non-negative.');
  return config;
}
