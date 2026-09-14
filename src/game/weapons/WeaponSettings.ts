import type { ProjectileDefinition } from '../ballistics/ProjectileDefinition';
import { projectileDefinitions } from '../ballistics/projectileDefinitions';
import type { GameConfig } from '../config/GameConfig';
import type { ImpactDefinition } from '../impacts/ImpactDefinition';
import { resolveImpactDefinition } from '../impacts/impactDefinitions';
import { clamp } from '../math/Vec2';
import type { WeaponDefinition, WeaponId } from './WeaponDefinition';
import { weaponDefinitions } from './weaponDefinitions';

export interface WeaponOverrides {
  weapon?: Partial<Pick<WeaponDefinition, 'muzzleVelocity' | 'cooldownSeconds'>>;
  projectile?: Partial<
    Pick<
      ProjectileDefinition,
      | 'massKg'
      | 'radiusMeters'
      | 'gravityScale'
      | 'windInfluence'
      | 'dragCoefficient'
      | 'maxLifetimeSeconds'
    >
  >;
  impact?: Partial<Omit<ImpactDefinition['terrainDamage'], 'enabled'>>;
}

export function resolveWeapon(config: Pick<GameConfig, 'weaponOverrides'>, id: WeaponId) {
  const overrides = config.weaponOverrides[id];
  const weapon = { ...weaponDefinitions[id], ...overrides?.weapon };
  const projectile = {
    ...projectileDefinitions[weapon.projectileDefinitionId],
    ...overrides?.projectile,
  };
  return {
    weapon,
    projectile,
    impact: resolveImpactDefinition(projectile.impactDefinitionId, overrides?.impact),
  };
}

type WeaponSection = keyof WeaponOverrides;
export type WeaponNumericSetting = {
  [Section in WeaponSection]: {
    section: Section;
    key: keyof NonNullable<WeaponOverrides[Section]>;
    label: string;
    unit: string;
    min: number;
    max: number;
    step: number;
  };
}[WeaponSection];

export const weaponNumericSettings: readonly WeaponNumericSetting[] = [
  {
    section: 'weapon',
    key: 'muzzleVelocity',
    label: 'Начальная скорость',
    unit: 'm/s',
    min: 1,
    max: 120,
    step: 0.5,
  },
  {
    section: 'weapon',
    key: 'cooldownSeconds',
    label: 'Интервал выстрелов',
    unit: 's',
    min: 0,
    max: 10,
    step: 0.1,
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
    section: 'projectile',
    key: 'gravityScale',
    label: 'Множитель гравитации',
    unit: '×',
    min: 0,
    max: 3,
    step: 0.1,
  },
  {
    section: 'projectile',
    key: 'windInfluence',
    label: 'Влияние ветра',
    unit: '×',
    min: 0,
    max: 3,
    step: 0.1,
  },
  {
    section: 'projectile',
    key: 'dragCoefficient',
    label: 'Множитель сопротивления',
    unit: '×',
    min: 0,
    max: 3,
    step: 0.1,
  },
  {
    section: 'impact',
    key: 'baseRadiusMeters',
    label: 'Базовый кратер',
    unit: 'm',
    min: 0.1,
    max: 3,
    step: 0.1,
  },
  {
    section: 'impact',
    key: 'energyScale',
    label: 'Масштаб энергии',
    unit: 'm/√J',
    min: 0,
    max: 0.1,
    step: 0.001,
  },
  {
    section: 'impact',
    key: 'maxRadiusMeters',
    label: 'Максимум кратера',
    unit: 'm',
    min: 0.1,
    max: 8,
    step: 0.1,
  },
];

export function weaponSettingValue(
  config: GameConfig,
  id: WeaponId,
  setting: WeaponNumericSetting,
): number {
  const resolved = resolveWeapon(config, id);
  if (setting.section === 'impact') return resolved.impact.terrainDamage[setting.key];
  if (setting.section === 'projectile') return resolved.projectile[setting.key];
  return resolved.weapon[setting.key];
}

export function withWeaponSetting(
  config: GameConfig,
  id: WeaponId,
  setting: WeaponNumericSetting,
  value: number,
): GameConfig {
  if (
    !Number.isFinite(value) ||
    !Object.hasOwn(weaponDefinitions, id) ||
    !weaponNumericSettings.some(
      (item) => item.section === setting.section && item.key === setting.key,
    )
  )
    return config;
  const overrides = config.weaponOverrides[id];
  return {
    ...config,
    weaponOverrides: {
      ...config.weaponOverrides,
      [id]: {
        ...overrides,
        [setting.section]: { ...overrides?.[setting.section], [setting.key]: value },
      },
    },
  };
}

/** Sanitize only provided overrides; absent fields keep using registry defaults. */
export function validateWeaponOverrides(
  input: GameConfig['weaponOverrides'],
): GameConfig['weaponOverrides'] {
  const result: GameConfig['weaponOverrides'] = {};
  for (const id of Object.keys(weaponDefinitions) as WeaponId[]) {
    const source = input[id];
    if (!source) continue;
    const target: WeaponOverrides = {};
    for (const setting of weaponNumericSettings) {
      const value = (source[setting.section] as Record<string, number> | undefined)?.[setting.key];
      if (value === undefined || !Number.isFinite(value)) continue;
      const group = (target[setting.section] ??= {}) as Record<string, number>;
      group[setting.key] = clamp(value, setting.min, setting.max);
    }
    result[id] = target;
  }
  return result;
}
