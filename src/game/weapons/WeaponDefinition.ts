import type { ProjectileDefinitionId } from '../ballistics/ProjectileDefinition';

export type WeaponId = 'basicCannon' | 'mortar';

/** Launch parameters only. Defaults are data; debug overrides live in GameConfig. */
export interface WeaponDefinition {
  readonly id: WeaponId;
  readonly name: string;
  readonly projectileDefinitionId: ProjectileDefinitionId;
  readonly muzzleVelocity: number;
  readonly cooldownSeconds: number;
  /** Starting elevation when this weapon is equipped; aiming remains unrestricted. */
  readonly defaultAngleDeg: number;
}
