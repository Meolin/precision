export interface GameConfig {
  simulation: { tickRate: number; maxFrameDeltaMs: number };
  world: { widthMeters: number; heightMeters: number; pixelsPerMeter: number };
  physics: { gravity: number; windAcceleration: number; airDrag: number };
  projectile: {
    muzzleVelocity: number;
    massKg: number;
    radiusMeters: number;
    maxLifetimeSeconds: number;
  };
  terrain: {
    cellSizeMeters: number;
    baseCraterRadiusMeters: number;
    maxCraterRadiusMeters: number;
    energyToCraterScale: number;
    surfaceHeightFraction: number;
    waveAmplitudeMeters: number;
    noiseAmplitudeMeters: number;
  };
  cannon: {
    minAngleDeg: number;
    maxAngleDeg: number;
    initialAngleDeg: number;
    barrelLengthMeters: number;
    mountHeightMeters: number;
    spawnXFraction: number;
    aimStepDeg: number;
  };
  preview: { maxSeconds: number; maxPoints: number };
}

export type EditableSection = 'simulation' | 'physics' | 'projectile' | 'terrain';
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
  {
    section: 'projectile',
    key: 'muzzleVelocity',
    label: 'Начальная скорость',
    unit: 'm/s',
    min: 1,
    max: 120,
    step: 0.5,
  },
  {
    section: 'projectile',
    key: 'massKg',
    label: 'Масса',
    unit: 'kg',
    min: 0.1,
    max: 50,
    step: 0.1,
  },
  {
    section: 'projectile',
    key: 'radiusMeters',
    label: 'Радиус',
    unit: 'm',
    min: 0.03,
    max: 0.5,
    step: 0.01,
  },
  {
    section: 'projectile',
    key: 'maxLifetimeSeconds',
    label: 'Время жизни',
    unit: 's',
    min: 1,
    max: 30,
    step: 1,
  },
  {
    section: 'terrain',
    key: 'baseCraterRadiusMeters',
    label: 'Базовый кратер',
    unit: 'm',
    min: 0.1,
    max: 3,
    step: 0.1,
  },
  {
    section: 'terrain',
    key: 'energyToCraterScale',
    label: 'Масштаб энергии',
    unit: 'm/√J',
    min: 0,
    max: 0.1,
    step: 0.001,
  },
  {
    section: 'terrain',
    key: 'maxCraterRadiusMeters',
    label: 'Максимум кратера',
    unit: 'm',
    min: 0.1,
    max: 8,
    step: 0.1,
  },
];

export function settingValue(config: GameConfig, setting: NumericSetting): number {
  // The registry contains numeric properties only; unknown keys are rejected on writes.
  const group: Record<string, number> = config[setting.section];
  return group[setting.key] ?? 0;
}
