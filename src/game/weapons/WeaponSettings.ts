import type { ProjectileDefinition } from '../ballistics/ProjectileDefinition';
import { projectileDefinitions } from '../ballistics/projectileDefinitions';
import type { GameConfig } from '../config/GameConfig';
import type { ImpactDefinition } from '../impacts/ImpactDefinition';
import { resolveImpactDefinition } from '../impacts/impactDefinitions';
import { clamp } from '../math/Vec2';
import type { WeaponDefinition, WeaponId } from './WeaponDefinition';
import { weaponDefinitions } from './weaponDefinitions';
import {
  defaultExplosionDefinition,
  validateExplosionDefinition,
  type ExplosionOverrides,
} from '../explosions/ExplosionDefinition';

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
  ricochet?: Partial<ProjectileDefinition['ricochet']>;
  explosion?: ExplosionOverrides;
}

export function resolveWeapon(config: Pick<GameConfig, 'weaponOverrides'>, id: WeaponId) {
  const overrides = config.weaponOverrides[id];
  const weapon = { ...weaponDefinitions[id], ...overrides?.weapon };
  const projectile = {
    ...projectileDefinitions[weapon.projectileDefinitionId],
    ...overrides?.projectile,
    ricochet: {
      ...projectileDefinitions[weapon.projectileDefinitionId].ricochet,
      ...overrides?.ricochet,
    },
  };
  return {
    weapon,
    projectile,
    impact: resolveImpactDefinition(
      projectile.impactDefinitionId,
      overrides?.impact,
      overrides?.explosion,
    ),
  };
}

type WeaponSection = keyof WeaponOverrides;
export type WeaponNumericSetting = {
  [Section in WeaponSection]: {
    section: Section;
    key: Exclude<
      keyof NonNullable<WeaponOverrides[Section]>,
      'enabled' | 'terrainOcclusionEnabled'
    >;
    label: string;
    unit: string;
    min: number;
    max: number;
    step: number;
  };
}[WeaponSection];

export const weaponNumericSettings: readonly WeaponNumericSetting[] = [
  {
    section: 'explosion',
    key: 'radiusMeters',
    label: 'Радиус поражения',
    unit: 'm',
    min: 0,
    max: 60,
    step: 0.1,
  },
  {
    section: 'explosion',
    key: 'innerRadiusMeters',
    label: 'Внутренний радиус',
    unit: 'm',
    min: 0,
    max: 60,
    step: 0.1,
  },
  {
    section: 'explosion',
    key: 'maxDamage',
    label: 'Максимальный урон',
    unit: 'HP',
    min: 0,
    max: 1000,
    step: 1,
  },
  {
    section: 'explosion',
    key: 'minDamage',
    label: 'Минимальный урон',
    unit: 'HP',
    min: 0,
    max: 1000,
    step: 1,
  },
  {
    section: 'explosion',
    key: 'terrainDamageRadiusMeters',
    label: 'Радиус кратера взрыва',
    unit: 'm',
    min: 0,
    max: 20,
    step: 0.1,
  },
  {
    section: 'explosion',
    key: 'occludedDamageMultiplier',
    label: 'Урон за укрытием',
    unit: '×',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    section: 'ricochet',
    key: 'minRicochetAngleDeg',
    label: 'Минимальный угол',
    unit: '°',
    min: 0,
    max: 89,
    step: 1,
  },
  {
    section: 'ricochet',
    key: 'minSpeedMetersPerSecond',
    label: 'Минимальная скорость',
    unit: 'm/s',
    min: 1,
    max: 120,
    step: 1,
  },
  {
    section: 'ricochet',
    key: 'energyRetention',
    label: 'Доля сохранённой энергии',
    unit: '×',
    min: 0.01,
    max: 0.99,
    step: 0.01,
  },
  {
    section: 'ricochet',
    key: 'maxRicochets',
    label: 'Максимум рикошетов',
    unit: '',
    min: 0,
    max: 8,
    step: 1,
  },
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
  if (setting.section === 'explosion') return explosionSettingValues(config, id)[setting.key];
  if (setting.section === 'impact') return resolved.impact.terrainDamage[setting.key];
  if (setting.section === 'ricochet') return resolved.projectile.ricochet[setting.key];
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
    if (typeof source.ricochet?.enabled === 'boolean')
      target.ricochet = { enabled: source.ricochet.enabled };
    if (typeof source.explosion?.enabled === 'boolean')
      target.explosion = { enabled: source.explosion.enabled };
    if (typeof source.explosion?.terrainOcclusionEnabled === 'boolean')
      target.explosion = {
        ...target.explosion,
        terrainOcclusionEnabled: source.explosion.terrainOcclusionEnabled,
      };
    for (const setting of weaponNumericSettings) {
      const value = (source[setting.section] as Record<string, number> | undefined)?.[setting.key];
      if (value === undefined || !Number.isFinite(value)) continue;
      const group = (target[setting.section] ??= {}) as Record<string, number>;
      const bounded = clamp(value, setting.min, setting.max);
      group[setting.key] = setting.key === 'maxRicochets' ? Math.round(bounded) : bounded;
    }
    if (target.explosion) {
      const resolved = explosionSettingValues({ weaponOverrides: { [id]: target } }, id);
      // Store dependent values when necessary so serialized overrides are valid too.
      if (
        target.explosion.innerRadiusMeters !== undefined ||
        target.explosion.radiusMeters !== undefined
      )
        target.explosion = { ...target.explosion, innerRadiusMeters: resolved.innerRadiusMeters };
      if (target.explosion.minDamage !== undefined || target.explosion.maxDamage !== undefined)
        target.explosion = { ...target.explosion, minDamage: resolved.minDamage };
    }
    result[id] = target;
  }
  return result;
}

export function withRicochetEnabled(
  config: GameConfig,
  id: WeaponId,
  enabled: boolean,
): GameConfig {
  const overrides = config.weaponOverrides[id];
  return {
    ...config,
    weaponOverrides: {
      ...config.weaponOverrides,
      [id]: { ...overrides, ricochet: { ...overrides?.ricochet, enabled } },
    },
  };
}

/** Keep disabled explosion tuning available for editing and re-enabling. */
export function explosionSettingValues(config: Pick<GameConfig, 'weaponOverrides'>, id: WeaponId) {
  const projectile = projectileDefinitions[weaponDefinitions[id].projectileDefinitionId];
  const defaults = resolveImpactDefinition(projectile.impactDefinitionId).explosion;
  return validateExplosionDefinition({
    ...defaultExplosionDefinition,
    ...defaults,
    ...config.weaponOverrides[id]?.explosion,
  });
}

export function withExplosionToggle(
  config: GameConfig,
  id: WeaponId,
  key: 'enabled' | 'terrainOcclusionEnabled',
  value: boolean,
): GameConfig {
  const overrides = config.weaponOverrides[id];
  return {
    ...config,
    weaponOverrides: {
      ...config.weaponOverrides,
      [id]: { ...overrides, explosion: { ...overrides?.explosion, [key]: value } },
    },
  };
}
