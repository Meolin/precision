import { useEffect, useState } from 'react';
import { calculateKineticEnergy } from '../game/ballistics/projectilePhysics';
import type { GameRuntime } from '../game/core/GameRuntime';
import { toDegrees } from '../game/math/Vec2';
import { resolveWeapon } from '../game/weapons/WeaponSettings';
import { weaponDefinitions } from '../game/weapons/weaponDefinitions';
import { projectileDefinitions } from '../game/ballistics/projectileDefinitions';
import { terrainMaterialDefinitions } from '../game/terrain/TerrainMaterialDefinition';
import { penetrationChannelRadius } from '../game/impacts/resolveImpact';
import { cloneUnit } from '../game/entities/UnitState';

function readTelemetry(runtime: GameRuntime) {
  const state = runtime.getState();
  const config = runtime.getConfig();
  const cannon = runtime.getRequestedCannon();
  const { weapon, projectile: definition, impact } = resolveWeapon(config, cannon.weaponId);
  const projectile = state.projectiles.at(-1);
  const cursor = runtime.getCursorPosition();
  const cursorMaterial = cursor
    ? terrainMaterialDefinitions[state.terrain.getMaterialAtWorldPosition(cursor)]
    : null;
  return {
    units: state.units.map(cloneUnit),
    activeUnits: state.units.filter((unit) => unit.alive).length,
    shooterAlive: state.cannon.alive,
    entityImpact: state.lastEntityImpact
      ? {
          ...state.lastEntityImpact,
          position: { ...state.lastEntityImpact.position },
          velocity: { ...state.lastEntityImpact.velocity },
          surfaceNormal: { ...state.lastEntityImpact.surfaceNormal },
        }
      : null,
    entityImpactProjectile: state.lastEntityImpact
      ? projectileDefinitions[state.lastEntityImpact.projectileDefinitionId].name
      : null,
    entityImpactWeapon: state.lastEntityImpact
      ? weaponDefinitions[state.lastEntityImpact.weaponId].name
      : null,
    tick: state.tick,
    seconds: state.elapsedSeconds,
    seed: state.seed,
    shots: state.shotsFired,
    active: state.projectiles.length,
    angle: toDegrees(cannon.angleRad),
    speed: projectile ? Math.hypot(projectile.velocity.x, projectile.velocity.y) : null,
    energy: projectile ? calculateKineticEnergy(projectile.massKg, projectile.velocity) : null,
    activeRicochetCount: projectile?.ricochetCount ?? null,
    activeMaxRicochets: projectile?.ricochet.maxRicochets ?? null,
    impactAngle: state.lastImpact ? toDegrees(state.lastImpact.impactAngleRad) : null,
    impactNormal: state.lastImpact ? { ...state.lastImpact.surfaceNormal } : null,
    impactResult: state.lastImpact?.result ?? null,
    ricochetCount: state.lastImpact?.ricochetCount ?? null,
    maxRicochets: state.lastImpact?.maxRicochets ?? null,
    energyRetention: state.lastImpact ? state.lastImpact.energyRetention * 100 : null,
    ricochet: definition.ricochet,
    impactEnergy: state.lastImpact?.kineticEnergyJ ?? null,
    crater: state.lastImpact?.craterRadiusMeters ?? null,
    removed: state.lastImpact?.removedCells ?? null,
    impactWeapon: state.lastImpact ? weaponDefinitions[state.lastImpact.weaponId].name : null,
    impactProjectile: state.lastImpact
      ? projectileDefinitions[state.lastImpact.projectileDefinitionId].name
      : null,
    impactSpeed: state.lastImpact?.speed ?? null,
    impactX: state.lastImpact?.position.x ?? null,
    impactY: state.lastImpact?.position.y ?? null,
    impactMaterial: state.lastImpact
      ? terrainMaterialDefinitions[state.lastImpact.materialId].name
      : null,
    penetrationStatus: state.lastImpact?.penetrationStatus ?? null,
    penetrationDepth: state.lastImpact?.penetrationDistanceMeters ?? null,
    energyLost: state.lastImpact?.energyLostJ ?? null,
    remainingEnergy: state.lastImpact?.remainingEnergyJ ?? null,
    exitSpeed: state.lastImpact?.exitSpeed ?? null,
    penetration: definition.penetration ?? null,
    channelRadius: definition.penetration
      ? penetrationChannelRadius(
          definition.radiusMeters,
          state.terrain.cellSizeMeters,
          definition.penetration,
          impact,
        )
      : null,
    cursor,
    cursorMaterial,
    weaponId: weapon.id,
    weaponName: weapon.name,
    projectileName: definition.name,
    weaponPending: weapon.id !== state.cannon.weaponId,
    cooldownRemaining: Math.max(0, state.cannon.nextFireTimeSeconds - state.elapsedSeconds),
    velocity: weapon.muzzleVelocity,
    mass: definition.massKg,
    muzzleEnergy: calculateKineticEnergy(definition.massKg, { x: weapon.muzzleVelocity, y: 0 }),
    terrainVersion: state.terrain.version,
    queued: runtime.pendingCommands,
  };
}

/** Sample compact HUD data at 10 Hz, including the last impact's debug coordinates. */
export function useTelemetry(runtime: GameRuntime) {
  const [telemetry, setTelemetry] = useState(() => readTelemetry(runtime));
  useEffect(() => {
    const timer = window.setInterval(() => setTelemetry(readTelemetry(runtime)), 100);
    return () => window.clearInterval(timer);
  }, [runtime]);
  return telemetry;
}

export function formatNumber(value: number | null, digits = 0): string {
  return value === null
    ? '—'
    : value.toLocaleString('ru-RU', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
}
