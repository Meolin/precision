import { advanceProjectile } from '../ballistics/projectilePhysics';
import { executeCommand } from '../commands/executeCommand';
import type { GameCommand } from '../commands/GameCommand';
import type { GameConfig } from '../config/GameConfig';
import type { Vec2 } from '../math/Vec2';
import { createImpactEvent } from '../impacts/ImpactEvent';
import { resolveImpact } from '../impacts/resolveImpact';
import { applyTerrainDamage } from '../terrain/damageTerrain';
import { resolveImpactDefinition } from '../impacts/impactDefinitions';
import { advanceActivePenetration } from '../impacts/resolvePenetration';
import { penetrationChannelRadius } from '../impacts/resolveImpact';
import type { TerrainDamageEvent } from '../terrain/TerrainDamageEvent';
import type { GameState } from './GameState';
import { applyRicochetContinuation } from '../impacts/ricochetContinuation';
import { createEntityImpactEvent } from '../combat/EntityImpactEvent';
import { resolveEntityDamage } from '../combat/resolveEntityDamage';
import { applyEntityDamage } from '../combat/applyEntityDamage';
import { updateInstallationOrders } from '../orders/updateInstallationOrders';
import { isInstallation } from '../entities/InstallationState';
import { refreshUnitGrounding } from '../movement/terrainGrounding';
import { createExplosionEvent, type ExplosionEvent } from '../explosions/ExplosionEvent';
import { resolveExplosion } from '../explosions/resolveExplosion';
import {
  advanceTerrainFall,
  queueTerrainSettling,
  startTerrainFall,
} from '../terrain/terrainSettling';

export function stepSimulation(
  state: GameState,
  config: GameConfig,
  dt: number,
  commands: readonly GameCommand[] = [],
  samples?: Vec2[],
): void {
  state.events = [];
  const terrainVersionAtStart = state.terrain.version;
  // Support correction precedes aiming and firing; installations never move horizontally.
  for (const unit of state.units) refreshUnitGrounding(unit, state.terrain);
  for (const command of commands) executeCommand(state, config, command);
  updateInstallationOrders(state, config);
  for (const projectile of state.projectiles) {
    if (!projectile.alive) continue;
    if (projectile.penetrationState) {
      const active = projectile.penetrationState;
      const profile = projectile.penetration;
      if (!profile) {
        projectile.penetrationState = undefined;
        projectile.alive = false;
        continue;
      }
      const step = advanceActivePenetration(
        active,
        projectile.massKg,
        projectile.radius,
        profile,
        state.terrain,
        dt,
      );
      projectile.previousPosition = { ...projectile.position };
      projectile.position = { ...step.to };
      projectile.velocity = { ...step.remainingVelocity };
      projectile.lifetimeSeconds += dt;
      let removedCells = 0;
      if (step.distanceMeters > 0) {
        const damage: TerrainDamageEvent = {
          type: 'terrainDamage',
          tick: state.tick,
          sourceProjectileId: projectile.id,
          energyJ: step.energyLostJ,
          operation: {
            type: 'capsule',
            from: { ...step.from },
            to: { ...step.to },
            radiusMeters: penetrationChannelRadius(
              projectile.radius,
              state.terrain.cellSizeMeters,
              profile,
              resolveImpactDefinition(
                projectile.impactDefinitionId,
                config.weaponOverrides[projectile.weaponId]?.impact,
              ),
            ),
          },
        };
        state.events.push(damage);
        removedCells = applyTerrainDamage(state.terrain, damage);
      }
      const lastImpact = state.lastImpact;
      if (lastImpact?.projectileId === projectile.id) {
        lastImpact.penetrationDistanceMeters = step.penetrationDistanceMeters;
        lastImpact.energyLostJ = Math.max(0, lastImpact.kineticEnergyJ - step.remainingEnergyJ);
        lastImpact.remainingEnergyJ = step.remainingEnergyJ;
        lastImpact.removedCells += removedCells;
        lastImpact.penetrationStatus =
          step.status === 'exited'
            ? 'success'
            : step.status === 'stopped'
              ? 'stopped'
              : 'penetrating';
        lastImpact.exitSpeed =
          step.status === 'exited'
            ? Math.hypot(step.remainingVelocity.x, step.remainingVelocity.y)
            : 0;
      }
      if (step.status === 'continue') {
        projectile.alive =
          projectile.lifetimeSeconds < projectile.maxLifetimeSeconds &&
          projectile.position.x >= -projectile.radius &&
          projectile.position.x <= config.world.widthMeters + projectile.radius &&
          projectile.position.y <= config.world.heightMeters + projectile.radius;
        continue;
      }
      projectile.penetrationState = undefined;
      projectile.previousPosition = { ...projectile.position };
      projectile.alive =
        step.status === 'exited' &&
        projectile.lifetimeSeconds < projectile.maxLifetimeSeconds &&
        projectile.position.x >= -projectile.radius &&
        projectile.position.x <= config.world.widthMeters + projectile.radius &&
        projectile.position.y <= config.world.heightMeters + projectile.radius;
      continue;
    }
    const hit = advanceProjectile(projectile, state.terrain, config, dt, samples, state.units);
    if (!hit) continue;
    if (hit.type === 'entity') {
      const impact = createEntityImpactEvent(projectile, hit, state.tick);
      const definition = resolveImpactDefinition(
        projectile.impactDefinitionId,
        config.weaponOverrides[projectile.weaponId]?.impact,
        config.weaponOverrides[projectile.weaponId]?.explosion,
      );
      const damage = resolveEntityDamage(impact, definition.entityDamage);
      state.events.push(impact, damage);
      const health = applyEntityDamage(state.units, damage);
      if (health) state.lastEntityImpact = { ...impact, ...health, damage: damage.damage };
      // Direct health changes precede the blast query; already-dead units are skipped.
      if (definition.explosion)
        applyExplosion(
          state,
          createExplosionEvent(impact, definition.explosion, projectile.ownerEntityId),
        );
      projectile.position = { ...hit.position };
      projectile.velocity = { x: 0, y: 0 };
      projectile.alive = false;
      continue;
    }
    const impact = createImpactEvent(projectile, hit, state.tick);
    state.events.push(impact);
    // Resolve with the source weapon, even if another weapon is selected now.
    // Impact overrides apply at contact, matching the original crater controls.
    const definition = resolveImpactDefinition(
      impact.impactDefinitionId,
      config.weaponOverrides[impact.weaponId]?.impact,
      config.weaponOverrides[impact.weaponId]?.explosion,
    );
    const resolution = resolveImpact(impact, definition, projectile, state.terrain);
    state.events.push({
      type: 'impactResolved',
      tick: state.tick,
      projectileId: projectile.id,
      resolution,
    });
    // Preserve MVP order: later shells in this tick see earlier craters.
    let removedCells = 0;
    let craterRadiusMeters = 0;
    if (definition.explosion) {
      const explosion = createExplosionEvent(
        impact,
        definition.explosion,
        projectile.ownerEntityId,
      );
      removedCells = applyExplosion(state, explosion);
      craterRadiusMeters = explosion.terrainDamageRadiusMeters;
    }
    for (const damage of resolution.terrainDamageEvents) {
      state.events.push(damage);
      removedCells += applyTerrainDamage(state.terrain, damage);
      if (damage.operation.type === 'circle') craterRadiusMeters = damage.operation.radiusMeters;
    }
    if (resolution.type === 'ricochet') {
      applyRicochetContinuation(projectile, resolution, config);
    } else if (resolution.continuePenetration && resolution.activePenetration) {
      const insideWorld =
        resolution.finalPosition.x >= -projectile.radius &&
        resolution.finalPosition.x <= config.world.widthMeters + projectile.radius &&
        resolution.finalPosition.y <= config.world.heightMeters + projectile.radius;
      if (projectile.lifetimeSeconds < projectile.maxLifetimeSeconds && insideWorld) {
        projectile.penetrationState = {
          ...resolution.activePenetration,
          position: { ...resolution.activePenetration.position },
          direction: { ...resolution.activePenetration.direction },
          materialSamples: [...resolution.activePenetration.materialSamples],
        };
        projectile.position = { ...resolution.finalPosition };
        projectile.previousPosition = { ...resolution.finalPosition };
        projectile.velocity = { ...resolution.remainingVelocity };
      } else {
        projectile.alive = false;
      }
    } else {
      projectile.position = { ...resolution.finalPosition };
      projectile.previousPosition = { ...resolution.finalPosition };
      projectile.velocity = { x: 0, y: 0 };
      projectile.alive = false;
    }
    const penetration = resolution.penetration;
    state.lastImpact = {
      ...impact,
      result: resolution.type,
      impactAngleRad: resolution.impactAngleRad,
      ricochetCount: projectile.ricochetCount,
      maxRicochets: projectile.ricochet.maxRicochets,
      energyRetention: resolution.type === 'ricochet' ? resolution.energyRetention : 0,
      craterRadiusMeters,
      removedCells,
      materialId: resolution.materialId,
      penetrationStatus:
        resolution.type === 'ricochet' || definition.explosion
          ? 'notAttempted'
          : resolution.continuePenetration
            ? 'penetrating'
            : projectile.penetration?.enabled || penetration
              ? 'stopped'
              : 'disabled',
      penetrationDistanceMeters: penetration?.penetrationDistanceMeters ?? 0,
      energyLostJ: Math.max(0, impact.kineticEnergyJ - resolution.remainingEnergyJ),
      remainingEnergyJ: resolution.remainingEnergyJ,
      exitSpeed: resolution.continuePenetration
        ? 0
        : Math.hypot(resolution.remainingVelocity.x, resolution.remainingVelocity.y),
    };
  }
  state.projectiles = state.projectiles.filter((projectile) => projectile.alive);
  const nextElapsedSeconds = state.elapsedSeconds + dt;
  for (const change of state.terrain.getChangesSince(terrainVersionAtStart))
    if (change.dirtyRect)
      queueTerrainSettling(state.pendingTerrainSettling, change.dirtyRect, nextElapsedSeconds);
  advanceTerrainFall(state.terrain, state.fallingTerrain, dt);
  for (let index = 0; index < state.pendingTerrainSettling.length;) {
    const pending = state.pendingTerrainSettling[index]!;
    if (pending.readyAtSeconds > nextElapsedSeconds) {
      index++;
      continue;
    }
    state.fallingTerrain.push(
      ...startTerrainFall(state.terrain, pending.rect, state.fallingTerrain),
    );
    state.pendingTerrainSettling.splice(index, 1);
  }
  // Craters/channels from this tick also ground stationary targets immediately.
  for (const unit of state.units) refreshUnitGrounding(unit, state.terrain);
  for (const installation of state.units.filter(isInstallation)) {
    if (!installation.alive) {
      installation.orders.length = 0;
      installation.fireControl.status = 'idle';
    }
  }
  state.tick++;
  state.elapsedSeconds += dt;
}

/** Health before crater. Subsequent projectiles in this tick see these changes. */
function applyExplosion(state: GameState, event: ExplosionEvent): number {
  state.events.push(event);
  const resolution = resolveExplosion(event, state.units, state.terrain);
  let entitiesDamaged = 0;
  let maxDealt = 0;
  for (const damage of resolution.entityDamageEvents) {
    state.events.push(damage);
    const health = applyEntityDamage(state.units, damage);
    if (health && health.healthAfter < health.healthBefore) {
      entitiesDamaged++;
      maxDealt = Math.max(maxDealt, health.healthBefore - health.healthAfter);
    }
  }
  let removedCells = 0;
  if (resolution.terrainDamageEvent) {
    state.events.push(resolution.terrainDamageEvent);
    removedCells = applyTerrainDamage(state.terrain, resolution.terrainDamageEvent);
  }
  state.events.push({
    type: 'explosionResolved',
    tick: event.tick,
    resolution,
    entitiesDamaged,
    maxDealt,
    removedCells,
  });
  return removedCells;
}
