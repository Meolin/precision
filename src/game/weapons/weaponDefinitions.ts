import type { WeaponDefinition, WeaponId } from './WeaponDefinition';

export const weaponDefinitions: Readonly<Record<WeaponId, WeaponDefinition>> = Object.freeze({
  basicCannon: Object.freeze({
    id: 'basicCannon',
    name: 'Basic Cannon',
    projectileDefinitionId: 'basicShell',
    muzzleVelocity: 30,
    // The original MVP had no cooldown; keep its firing behavior.
    cooldownSeconds: 0,
    defaultAngleDeg: 42,
  }),
  mortar: Object.freeze({
    id: 'mortar',
    name: 'Mortar',
    projectileDefinitionId: 'mortarShell',
    muzzleVelocity: 24,
    cooldownSeconds: 0.8,
    defaultAngleDeg: 70,
  }),
});

export function isWeaponId(value: string): value is WeaponId {
  return Object.hasOwn(weaponDefinitions, value);
}
