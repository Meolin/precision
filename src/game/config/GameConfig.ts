import type { WeaponId } from '../weapons/WeaponDefinition';
import type { WeaponOverrides } from '../weapons/WeaponSettings';

export interface GameConfig {
  simulation: { tickRate: number; maxFrameDeltaMs: number };
  world: { widthMeters: number; heightMeters: number; pixelsPerMeter: number };
  physics: { gravity: number; windAcceleration: number; airDrag: number };
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

export type EditableSection = 'simulation' | 'physics';
interface SettingDefinition<Section extends EditableSection> {
  section: Section;
  key: keyof GameConfig[Section];
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}
export type NumericSetting = {
  [Section in EditableSection]: SettingDefinition<Section>;
}[EditableSection];

// One registry drives both the numeric UI and runtime validation.
export const numericSettings: readonly NumericSetting[] = [
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
  const group: Record<string, number> = config[setting.section];
  return group[setting.key] ?? 0;
}
