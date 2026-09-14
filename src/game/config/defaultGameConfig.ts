import { clamp } from '../math/Vec2';
import { numericSettings, settingValue, type GameConfig, type NumericSetting } from './GameConfig';

export const defaultGameConfig: GameConfig = {
  simulation: { tickRate: 60, maxFrameDeltaMs: 250 },
  world: { widthMeters: 120, heightMeters: 64, pixelsPerMeter: 20 },
  physics: { gravity: 9.81, windAcceleration: 0, airDrag: 0 },
  projectile: { muzzleVelocity: 30, massKg: 5, radiusMeters: 0.12, maxLifetimeSeconds: 20 },
  terrain: {
    cellSizeMeters: 0.2,
    baseCraterRadiusMeters: 0.8,
    maxCraterRadiusMeters: 3,
    energyToCraterScale: 0.025,
    surfaceHeightFraction: 0.7,
    waveAmplitudeMeters: 4.2,
    noiseAmplitudeMeters: 1,
  },
  cannon: {
    minAngleDeg: 5,
    maxAngleDeg: 85,
    initialAngleDeg: 42,
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
    projectile: { ...config.projectile },
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
  for (const setting of numericSettings) {
    const value = settingValue(config, setting);
    const group: Record<string, number> = config[setting.section];
    group[setting.key] = Number.isFinite(value)
      ? clamp(value, setting.min, setting.max)
      : settingValue(defaultGameConfig, setting);
  }
  config.simulation.tickRate = Math.round(config.simulation.tickRate);
  config.terrain.maxCraterRadiusMeters = Math.max(
    config.terrain.baseCraterRadiusMeters,
    config.terrain.maxCraterRadiusMeters,
  );
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
  return config;
}
