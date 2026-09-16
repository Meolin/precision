import { clamp } from '../math/Vec2';
import { validateWeaponOverrides } from '../weapons/WeaponSettings';
import { numericSettings, settingValue, type GameConfig, type NumericSetting } from './GameConfig';
import { cameraFrame, mapWidthInCameras } from './worldLayout';

export const defaultGameConfig: GameConfig = {
  simulation: { tickRate: 60, maxFrameDeltaMs: 250 },
  world: {
    widthMeters: cameraFrame.widthMeters * mapWidthInCameras,
    heightMeters: cameraFrame.heightMeters,
    pixelsPerMeter: 20,
  },
  physics: { gravity: 9.81, windAcceleration: 0, airDrag: 0 },
  rts: {
    installationsPerPlayer: 4,
    maxOrders: 24,
    solverAngleStepDeg: 2,
    solverRefinements: 3,
    solverToleranceMeters: 1,
    solverMaxSeconds: 20,
    solverMaxTicksPerCandidate: 4800,
  },
  movement: { speedMetersPerSecond: 4, maxSlopeAngleDeg: 45 },
  damagePopup: {
    initialSpeedMultiplier: 1,
    initialSizeMultiplier: 1,
    baseDistanceMeters: 4,
    animationDurationMultiplier: 1,
    verticalRiseSpeedMetersPerSecond: 0.6,
    // v(t) = 1 - t² when x = t: a smooth, gradually increasing deceleration.
    velocityCurve: { control1: { x: 1 / 3, y: 1 }, control2: { x: 2 / 3, y: 2 / 3 } },
  },
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
    rts: { ...defaultGameConfig.rts, ...config.rts },
    movement: { ...config.movement },
    damagePopup: {
      ...defaultGameConfig.damagePopup,
      ...config.damagePopup,
      velocityCurve: {
        ...defaultGameConfig.damagePopup.velocityCurve,
        ...config.damagePopup.velocityCurve,
      },
    },
    weaponOverrides: Object.fromEntries(
      Object.entries(config.weaponOverrides).map(([id, overrides]) => [
        id,
        {
          weapon: { ...overrides.weapon },
          projectile: { ...overrides.projectile },
          impact: { ...overrides.impact },
          ricochet: { ...overrides.ricochet },
          explosion: { ...overrides.explosion },
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

export function withDamagePopupCurve(
  config: GameConfig,
  velocityCurve: GameConfig['damagePopup']['velocityCurve'],
): GameConfig {
  return {
    ...config,
    damagePopup: {
      ...config.damagePopup,
      velocityCurve: {
        control1: { ...velocityCurve.control1 },
        control2: { ...velocityCurve.control2 },
      },
    },
  };
}

export function validateConfig(input: GameConfig): GameConfig {
  const config = cloneConfig(input);
  config.weaponOverrides = validateWeaponOverrides(config.weaponOverrides);
  const rtsBounds: Record<keyof GameConfig['rts'], [number, number]> = {
    installationsPerPlayer: [1, 5],
    maxOrders: [1, 32],
    solverAngleStepDeg: [0.5, 10],
    solverRefinements: [0, 5],
    solverToleranceMeters: [0.1, 3],
    solverMaxSeconds: [1, 30],
    solverMaxTicksPerCandidate: [60, 7200],
  };
  for (const key of Object.keys(rtsBounds) as (keyof GameConfig['rts'])[]) {
    const [min, max] = rtsBounds[key];
    config.rts[key] = Number.isFinite(config.rts[key])
      ? clamp(config.rts[key], min, max)
      : defaultGameConfig.rts[key];
  }
  config.rts.installationsPerPlayer = Math.round(config.rts.installationsPerPlayer);
  config.rts.maxOrders = Math.round(config.rts.maxOrders);
  config.rts.solverRefinements = Math.round(config.rts.solverRefinements);
  config.rts.solverMaxTicksPerCandidate = Math.round(config.rts.solverMaxTicksPerCandidate);
  for (const setting of numericSettings) {
    const value = settingValue(config, setting);
    const group = config[setting.section] as unknown as Record<string, number>;
    const validOption =
      !setting.options || setting.options.some((option) => option.value === value);
    group[setting.key] =
      Number.isFinite(value) && validOption
        ? clamp(value, setting.min, setting.max)
        : settingValue(defaultGameConfig, setting);
  }
  const curve = config.damagePopup.velocityCurve;
  const defaultCurve = defaultGameConfig.damagePopup.velocityCurve;
  curve.control1.x = Number.isFinite(curve.control1.x)
    ? clamp(curve.control1.x, 0, 1)
    : defaultCurve.control1.x;
  curve.control1.y = Number.isFinite(curve.control1.y)
    ? clamp(curve.control1.y, 0, 1)
    : defaultCurve.control1.y;
  curve.control2.x = Number.isFinite(curve.control2.x)
    ? clamp(curve.control2.x, curve.control1.x, 1)
    : defaultCurve.control2.x;
  curve.control2.y = Number.isFinite(curve.control2.y)
    ? clamp(curve.control2.y, 0, 1)
    : defaultCurve.control2.y;
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
