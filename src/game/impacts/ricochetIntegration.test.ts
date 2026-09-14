import { describe, expect, it } from 'vitest';
import { createProjectile } from '../ballistics/Projectile';
import { projectileDefinitions } from '../ballistics/projectileDefinitions';
import { advanceProjectile, calculateKineticEnergy } from '../ballistics/projectilePhysics';
import { simulateTrajectoryPreview } from '../ballistics/trajectoryPreview';
import { executeCommand } from '../commands/executeCommand';
import { cloneConfig, validateConfig } from '../config/defaultGameConfig';
import { createGameState } from '../core/GameState';
import { createGameSnapshot } from '../core/GameSnapshot';
import { GameRuntime } from '../core/GameRuntime';
import { stepSimulation } from '../core/stepSimulation';
import { toRadians } from '../math/Vec2';
import { TerrainGrid } from '../terrain/TerrainGrid';
import { TerrainMaterialId as Material } from '../terrain/TerrainMaterialId';
import { circleTouchesTerrain } from '../terrain/terrainCollision';
import { applyTerrainDamage } from '../terrain/damageTerrain';
import { resolveWeapon, withRicochetEnabled } from '../weapons/WeaponSettings';
import type { WeaponId } from '../weapons/WeaponDefinition';
import { createImpactEvent } from './ImpactEvent';
import { impactDefinitions } from './impactDefinitions';
import { resolveImpact } from './resolveImpact';

function scene(weaponId: WeaponId = 'basicCannon', material: Material = Material.Rock) {
  const config = cloneConfig();
  config.world.widthMeters = 40;
  config.world.heightMeters = 16;
  config.physics = { gravity: 0, windAcceleration: 0, airDrag: 0 };
  const state = createGameState(config, 12345);
  state.terrain = new TerrainGrid(200, 80, 0.2);
  for (let y = 20; y < state.terrain.rows; y++)
    for (let x = 0; x < state.terrain.columns; x++) state.terrain.setMaterial(x, y, material);
  executeCommand(state, config, { type: 'setWeapon', cannonId: 1, weaponId });
  const projectile = createProjectile(state.cannon, config, 2, 0);
  projectile.position = { x: 5.1, y: 3.8 };
  projectile.previousPosition = { ...projectile.position };
  projectile.velocity = { x: 30, y: 8 };
  state.projectiles.push(projectile);
  return { config, state, projectile };
}

describe('ricochet lifecycle', () => {
  it('reflects on Rock, emits only a small chip, and resumes ballistic flight without a duplicate contact', () => {
    const { state, config, projectile } = scene();
    const initialEnergy = calculateKineticEnergy(projectile.massKg, projectile.velocity);
    const replayTerrain = new TerrainGrid(200, 80, 0.2, state.terrain.cells);
    stepSimulation(state, config, 1 / 60);
    expect(state.lastImpact).toMatchObject({
      result: 'ricochet',
      ricochetCount: 1,
      penetrationStatus: 'notAttempted',
    });
    expect(projectile.alive).toBe(true);
    expect(projectile.previousPosition).toEqual(projectile.position);
    expect(projectile.previousPosition).not.toBe(projectile.position);
    expect(projectile.velocity.y).toBeLessThan(0);
    expect(projectile.penetrationState).toBeUndefined();
    expect(circleTouchesTerrain(state.terrain, projectile.position, projectile.radius)).toBe(false);
    expect(calculateKineticEnergy(projectile.massKg, projectile.velocity)).toBeCloseTo(
      initialEnergy * projectile.ricochet.energyRetention,
    );
    expect(state.lastImpact!.craterRadiusMeters).toBeLessThan(0.31);
    expect(state.lastImpact!.removedCells).toBeGreaterThan(0);
    const damages = state.events.filter((event) => event.type === 'terrainDamage');
    expect(damages).toHaveLength(1);
    for (const damage of damages) {
      expect(damage.operation.type).toBe('circle');
      applyTerrainDamage(replayTerrain, JSON.parse(JSON.stringify(damage)));
    }
    expect(replayTerrain.cells).toEqual(state.terrain.cells);
    expect(JSON.parse(JSON.stringify(state.events))).toEqual(state.events);
    const before = { ...projectile.velocity };
    config.physics = { gravity: 10, windAcceleration: 2, airDrag: 0.1 };
    stepSimulation(state, config, 1 / 60);
    expect(state.events).toEqual([]);
    expect(projectile.ricochetCount).toBe(1);
    expect(projectile.velocity.x).toBeCloseTo((before.x + 2 / 60) * Math.exp(-0.1 / 60));
    expect(projectile.velocity.y).toBeCloseTo((before.y + 10 / 60) * Math.exp(-0.1 / 60));
  });

  it('protects continuation against overlap even when terrain damage is disabled', () => {
    const { state, config, projectile } = scene();
    const hit = advanceProjectile(projectile, state.terrain, config, 1 / 60)!;
    const before = state.terrain.cells.slice();
    const result = resolveImpact(
      createImpactEvent(projectile, hit, 0),
      {
        ...impactDefinitions.basicImpact,
        terrainDamage: { ...impactDefinitions.basicImpact.terrainDamage, enabled: false },
      },
      projectile,
      state.terrain,
    );
    expect(result.type).toBe('ricochet');
    expect(result.terrainDamageEvents).toEqual([]);
    expect(circleTouchesTerrain(state.terrain, result.finalPosition, projectile.radius)).toBe(
      false,
    );
    expect(state.terrain.cells).toEqual(before);
  });

  it('keeps Soil and default Mortar on the stop path', () => {
    for (const fixture of [scene('basicCannon', Material.Soil), scene('mortar')]) {
      stepSimulation(fixture.state, fixture.config, 1 / 60);
      expect(fixture.state.lastImpact?.result).toBe('stop');
      expect(fixture.projectile.ricochetCount).toBe(0);
      expect(fixture.projectile.alive).toBe(false);
    }
  });

  it('prioritizes glancing ricochet but preserves frontal Heavy Penetrator traversal', () => {
    const glancing = scene('heavyPenetrator');
    stepSimulation(glancing.state, glancing.config, 1 / 60);
    expect(glancing.state.lastImpact?.result).toBe('ricochet');
    const frontal = scene('heavyPenetrator', Material.Soil);
    frontal.projectile.velocity = { x: 0, y: 50 };
    // Thin floor: a frontal penetrator should exit it under the existing energy model.
    for (let y = 25; y < frontal.state.terrain.rows; y++)
      for (let x = 0; x < frontal.state.terrain.columns; x++)
        frontal.state.terrain.setMaterial(x, y, Material.Air);
    stepSimulation(frontal.state, frontal.config, 1 / 60);
    expect(frontal.state.lastImpact?.result).toBe('penetrate');
    expect(frontal.state.lastImpact?.impactAngleRad).toBe(0);
    for (let tick = 0; tick < 120 && frontal.projectile.penetrationState; tick++)
      stepSimulation(frontal.state, frontal.config, 1 / 60);
    expect(frontal.state.lastImpact?.penetrationStatus).toBe('success');
    expect(frontal.projectile.alive).toBe(true);
  });

  it('falls through to stop/penetration once the projectile reaches its bounce limit', () => {
    for (const weapon of ['basicCannon', 'heavyPenetrator'] as const) {
      const fixture = scene(weapon);
      fixture.projectile.ricochetCount = fixture.projectile.ricochet.maxRicochets;
      stepSimulation(fixture.state, fixture.config, 1 / 60);
      expect(fixture.state.lastImpact?.result).toBe(
        weapon === 'basicCannon' ? 'stop' : 'penetrate',
      );
    }
  });

  it('counts actual repeated bounces between two surfaces and resolves the next contact normally', () => {
    for (const weapon of ['basicCannon', 'heavyPenetrator'] as const) {
      const { state, config, projectile } = scene(weapon);
      for (let y = 0; y <= 10; y++)
        for (let x = 0; x < state.terrain.columns; x++)
          state.terrain.setMaterial(x, y, Material.Rock);
      const results: string[] = [];
      const energies: number[] = [];
      for (let tick = 0; tick < 240 && projectile.alive; tick++) {
        stepSimulation(state, config, 1 / 60);
        for (const event of state.events)
          if (event.type === 'impactResolved') {
            results.push(event.resolution.type);
            energies.push(event.resolution.initialEnergyJ);
          }
        if (results.length > projectile.ricochet.maxRicochets) break;
      }
      expect(results).toEqual(
        weapon === 'basicCannon' ? ['ricochet', 'stop'] : ['ricochet', 'ricochet', 'penetrate'],
      );
      expect(projectile.ricochetCount).toBe(projectile.ricochet.maxRicochets);
      for (let i = 1; i < energies.length; i++) expect(energies[i]).toBeLessThan(energies[i - 1]!);
    }
  });

  it('stops exhausted candidates and does not revive an expired projectile', () => {
    const slow = scene('heavyPenetrator');
    slow.projectile.velocity = { x: Math.sqrt(120), y: 1 };
    slow.projectile.position.y = 3.839;
    stepSimulation(slow.state, slow.config, 1 / 60);
    expect(slow.state.lastImpact?.result).toBe('stop');
    expect(slow.projectile.alive).toBe(false);
    expect(slow.projectile.penetrationState).toBeUndefined();
    const expired = scene();
    expired.projectile.maxLifetimeSeconds = 0.001;
    stepSimulation(expired.state, expired.config, 1 / 60);
    expect(expired.state.projectiles).toHaveLength(0);
    expect(expired.projectile.alive).toBe(false);
  });

  it('snapshots tuning at spawn and preserves detached JSON-safe ricochet data', () => {
    const { state, config, projectile } = scene();
    config.weaponOverrides.basicCannon = {
      ricochet: { enabled: false, energyRetention: 0.2, maxRicochets: 4 },
    };
    expect(createProjectile(state.cannon, config, 3, 1).ricochet).toMatchObject({
      enabled: false,
      energyRetention: 0.2,
      maxRicochets: 4,
    });
    expect(projectile.ricochet).toEqual(projectileDefinitions.basicShell.ricochet);
    expect(projectile.ricochet).not.toBe(projectileDefinitions.basicShell.ricochet);
    stepSimulation(state, config, 1 / 60, [{ type: 'setWeapon', cannonId: 1, weaponId: 'mortar' }]);
    expect(state.lastImpact).toMatchObject({ result: 'ricochet', weaponId: 'basicCannon' });
    const snapshot = createGameSnapshot(state);
    expect(snapshot.projectiles[0]!.ricochet).not.toBe(projectile.ricochet);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    state.lastImpact!.surfaceNormal.y = 0;
    state.lastImpact!.contactPoint.x = -100;
    expect(snapshot.lastImpact!.surfaceNormal.y).toBe(-1);
    expect(snapshot.lastImpact!.contactPoint.x).toBeGreaterThan(0);
  });
});

describe('preview and runtime overrides', () => {
  it('shows exactly one ricochet with the same flight points as live simulation and leaves terrain intact', () => {
    const { state, config } = scene();
    config.physics.gravity = 9.81;
    state.projectiles = [];
    state.cannon.position = { x: 4, y: 2 };
    state.cannon.angleRad = toRadians(5);
    const cells = state.terrain.cells.slice();
    const version = state.terrain.version;
    const preview = simulateTrajectoryPreview(state.cannon, state.terrain, config);
    expect(preview.ricochets).toHaveLength(1);
    expect(state.terrain.cells).toEqual(cells);
    expect(state.terrain.version).toBe(version);
    const projectile = createProjectile(state.cannon, config, 2, 0);
    state.projectiles.push(projectile);
    const positions = [{ ...projectile.position }];
    const contacts = [];
    for (let tick = 0; tick < 1200 && projectile.alive; tick++) {
      stepSimulation(state, config, 1 / 60);
      positions.push({ ...projectile.position });
      for (const event of state.events)
        if (event.type === 'projectileImpact') {
          positions.push({ ...event.position });
          contacts.push(event.position);
        }
      if (contacts.length === 2) break;
    }
    expect(preview.ricochets![0]).toEqual(contacts[0]);
    for (const position of preview.points) expect(positions).toContainEqual(position);
    expect(preview.impact).toEqual(contacts[1] ?? null);
    expect(preview.flightSeconds).toBe(projectile.lifetimeSeconds);
  });

  it('clamps and clones overrides, refreshes preview, and resets to registry defaults', () => {
    const config = cloneConfig();
    config.weaponOverrides.basicCannon = {
      ricochet: {
        enabled: false,
        minRicochetAngleDeg: 120,
        energyRetention: 2,
        minSpeedMetersPerSecond: -1,
        maxRicochets: 2.6,
      },
    };
    const validated = validateConfig(config);
    expect(resolveWeapon(validated, 'basicCannon').projectile.ricochet).toEqual({
      enabled: false,
      minRicochetAngleDeg: 89,
      energyRetention: 0.99,
      minSpeedMetersPerSecond: 1,
      maxRicochets: 3,
    });
    expect(cloneConfig(validated).weaponOverrides.basicCannon!.ricochet).not.toBe(
      validated.weaponOverrides.basicCannon!.ricochet,
    );
    const runtime = new GameRuntime();
    const before = runtime.getTrajectoryPreview();
    runtime.updateConfig(withRicochetEnabled(runtime.getConfig(), 'basicCannon', false));
    expect(runtime.getTrajectoryPreview()).not.toBe(before);
    runtime.resetSettings();
    expect(resolveWeapon(runtime.getConfig(), 'basicCannon').projectile.ricochet).toEqual(
      projectileDefinitions.basicShell.ricochet,
    );
  });
});
