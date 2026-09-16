import type { WeaponId } from '../weapons/WeaponDefinition';
import type { WeaponOverrides } from '../weapons/WeaponSettings';

export interface DamagePopupVelocityCurve {
  control1: { x: number; y: number };
  control2: { x: number; y: number };
}

export interface GameConfig {
  simulation: { tickRate: number; maxFrameDeltaMs: number };
  world: { widthMeters: number; heightMeters: number; pixelsPerMeter: number };
  physics: { gravity: number; windAcceleration: number; airDrag: number };
  rts: {
    installationsPerPlayer: number;
    maxOrders: number;
    solverAngleStepDeg: number;
    solverRefinements: number;
    solverToleranceMeters: number;
    solverMaxSeconds: number;
    solverMaxTicksPerCandidate: number;
  };
  /** Legacy movement fixtures only; installations never have locomotion. */
  movement: { speedMetersPerSecond: number; maxSlopeAngleDeg: number };
  damagePopup: {
    initialSpeedMultiplier: number;
    initialSizeMultiplier: number;
    baseDistanceMeters: number;
    animationDurationMultiplier: number;
    verticalRiseSpeedMetersPerSecond: number;
    velocityCurve: DamagePopupVelocityCurve;
  };
  weaponOverrides: Partial<Record<WeaponId, WeaponOverrides>>;
  terrain: {
    cellSizeMeters: number;
    surfaceHeightFraction: number;
    waveAmplitudeMeters: number;
    noiseAmplitudeMeters: number;
    /** null generates the legacy, all-Soil terrain. */
    rockDepthMeters: number | null;
    rockVariationMeters: number;
  };
  cannon: {
    minAngleDeg: number;
    maxAngleDeg: number;
    barrelLengthMeters: number;
    mountHeightMeters: number;
    spawnXFraction: number;
    aimStepDeg: number;
  };
  preview: { maxSeconds: number; maxPoints: number };
}

export type EditableSection = 'simulation' | 'physics' | 'movement' | 'damagePopup';
type NumericEditableSection = EditableSection;
interface SettingDefinition<Section extends NumericEditableSection> {
  section: Section;
  key: keyof GameConfig[Section];
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  options?: readonly { value: number; label: string }[];
}
export type NumericSetting = {
  [Section in NumericEditableSection]: SettingDefinition<Section>;
}[NumericEditableSection];

// One registry drives both the numeric UI and runtime validation.
export const numericSettings: readonly NumericSetting[] = [
  {
    section: 'damagePopup',
    key: 'initialSpeedMultiplier',
    label: 'Начальная скорость',
    unit: '×',
    min: 0,
    max: 5,
    step: 0.05,
  },
  {
    section: 'damagePopup',
    key: 'initialSizeMultiplier',
    label: 'Начальный размер',
    unit: '×',
    min: 0.25,
    max: 3,
    step: 0.05,
  },
  {
    section: 'damagePopup',
    key: 'baseDistanceMeters',
    label: 'Дистанция вылета',
    unit: 'm',
    min: 0,
    max: 20,
    step: 0.25,
  },
  {
    section: 'damagePopup',
    key: 'animationDurationMultiplier',
    label: 'Время анимации',
    unit: '×',
    min: 0.25,
    max: 3,
    step: 0.05,
  },
  {
    section: 'damagePopup',
    key: 'verticalRiseSpeedMetersPerSecond',
    label: 'Скорость подъёма',
    unit: 'm/s',
    min: 0,
    max: 5,
    step: 0.05,
  },
  {
    section: 'movement',
    key: 'speedMetersPerSecond',
    label: 'Скорость движения',
    unit: 'm/s',
    min: 0,
    max: 15,
    step: 0.1,
  },
  {
    section: 'movement',
    key: 'maxSlopeAngleDeg',
    label: 'Максимальный склон',
    unit: '°',
    min: 0,
    max: 80,
    step: 1,
  },
  {
    section: 'simulation',
    key: 'tickRate',
    label: 'Частота',
    unit: 'Hz',
    min: 15,
    max: 240,
    step: 1,
  },
  {
    section: 'physics',
    key: 'gravity',
    label: 'Гравитация',
    unit: 'm/s²',
    min: 0,
    max: 40,
    step: 0.01,
  },
  {
    section: 'physics',
    key: 'windAcceleration',
    label: 'Ветер',
    unit: 'm/s²',
    min: -20,
    max: 20,
    step: 0.1,
  },
  {
    section: 'physics',
    key: 'airDrag',
    label: 'Сопротивление',
    unit: 's⁻¹',
    min: 0,
    max: 2,
    step: 0.01,
  },
];

export function settingValue(config: GameConfig, setting: NumericSetting): number {
  // The registry contains numeric properties only; unknown keys are rejected on writes.
  const group = config[setting.section] as unknown as Record<string, number>;
  return group[setting.key] ?? 0;
}
