import { describe, expect, it } from 'vitest';
import { createProjectile } from '../ballistics/Projectile';
import { projectileDefinitions } from '../ballistics/projectileDefinitions';
import { advanceProjectile, calculateKineticEnergy } from '../ballistics/projectilePhysics';
import { cloneConfig } from '../config/defaultGameConfig';
import { createGameState } from '../core/GameState';
import { createGameSnapshot } from '../core/GameSnapshot';
import { stepSimulation } from '../core/stepSimulation';
import { executeCommand } from '../commands/executeCommand';
import { TerrainGrid } from '../terrain/TerrainGrid';
import { TerrainMaterialId as Material } from '../terrain/TerrainMaterialId';
import { circleTouchesTerrain } from '../terrain/terrainCollision';
import { applyTerrainDamage } from '../terrain/damageTerrain';
import type { TerrainDamageEvent } from '../terrain/TerrainDamageEvent';
import { impactDefinitions } from './impactDefinitions';
import { createImpactEvent } from './ImpactEvent';
import { resolveImpact } from './resolveImpact';

function scene(material: Material = Material.Soil, end = 4) {
  const config = cloneConfig();
  config.physics = { gravity: 0, windAcceleration: 0, airDrag: 0 };
  // Preserve the Step 3 traversal fixture independently of Step 4 bounce defaults.
  config.weaponOverrides.heavyPenetrator = { ricochet: { enabled: false } };
  const state = createGameState(config, 12345);
  state.terrain = new TerrainGrid(100, 40, 0.2);
  for (let col = 15; col < end / 0.2; col++)
    for (let row = 0; row < 40; row++) state.terrain.setMaterial(col, row, material);
  executeCommand(state, config, { type: 'setWeapon', cannonId: 1, weaponId: 'heavyPenetrator' });
  const shell = createProjectile(state.cannon, config, 2, 0);
  shell.position = { x: 2, y: 2.1 };
  shell.previousPosition = { ...shell.position };
  shell.velocity = { x: 100, y: 0 };
  shell.massKg = 2;
  state.projectiles.push(shell);
  return { config, state, shell };
}

function runPenetrationToTerminal(
  state: ReturnType<typeof scene>['state'],
  config: ReturnType<typeof scene>['config'],
  shell: ReturnType<typeof scene>['shell'],
  maxTicks = 120,
) {
  const damageEvents: TerrainDamageEvent[] = [];
  for (let tick = 0; tick < maxTicks && shell.penetrationState; tick++) {
    stepSimulation(state, config, 1 / config.simulation.tickRate);
    damageEvents.push(...state.events.filter((event) => event.type === 'terrainDamage'));
  }
  return damageEvents;
}

describe('penetration lifecycle and semantic damage', () => {
  it('looks up the rim material when the center is still Air, before applying crater damage', () => {
    const { state, shell, config } = scene(Material.Rock);
    const hit = advanceProjectile(shell, state.terrain, config, 0.02)!;
    expect(state.terrain.getMaterialAtWorldPosition(hit.position)).toBe(Material.Air);
    const before = state.terrain.cells.slice();
    const resolution = resolveImpact(
      createImpactEvent(shell, hit, 0),
      impactDefinitions.penetratorImpact,
      shell,
      state.terrain,
    );
    expect(resolution.materialId).toBe(Material.Rock);
    expect(resolution.type).toBe('penetrate');
    expect(
      resolution.penetration!.traversedSegments.every(
        (segment) => segment.materialId === Material.Rock,
      ),
    ).toBe(true);
    expect(state.terrain.cells).toEqual(before);
    expect(JSON.parse(JSON.stringify(resolution))).toEqual(resolution);
    expect(resolution.terrainDamageEvents.map((event) => event.operation.type)).toEqual(['circle']);
  });

  it('clears the channel, resets previousPosition and continues without a duplicate impact', () => {
    const { state, shell, config } = scene();
    stepSimulation(state, config, 0.02);
    expect(shell.alive).toBe(true);
    expect(state.lastImpact?.penetrationStatus).toBe('penetrating');
    const damageEvents = runPenetrationToTerminal(state, config, shell);
    expect(shell.penetrationState).toBeUndefined();
    expect(state.lastImpact?.penetrationStatus).toBe('success');
    expect(shell.previousPosition).toEqual(shell.position);
    expect(shell.previousPosition).not.toBe(shell.position);
    expect(shell.position.x).toBeGreaterThan(4 + shell.radius);
    expect(circleTouchesTerrain(state.terrain, shell.position, shell.radius)).toBe(false);
    expect(calculateKineticEnergy(shell.massKg, shell.velocity)).toBeCloseTo(
      state.lastImpact!.remainingEnergyJ,
    );
    expect(shell.velocity.x).toBeLessThan(100);
    const replay = new TerrainGrid(100, 40, 0.2);
    for (const event of damageEvents) applyTerrainDamage(replay, JSON.parse(JSON.stringify(event)));
    for (let x = 3; x < 4; x += 0.05)
      expect(circleTouchesTerrain(state.terrain, { x, y: 2.1 }, shell.radius)).toBe(false);
    expect(state.terrain.getMaterialAtWorldPosition({ x: 3.5, y: 6.1 })).toBe(Material.Soil);
    const exit = { ...shell.position };
    const speed = shell.velocity.x;
    const lifetimeAtExit = shell.lifetimeSeconds;
    config.physics.gravity = 10;
    stepSimulation(state, config, 0.01);
    expect(state.events).toEqual([]);
    expect(state.projectiles).toHaveLength(1);
    expect(shell.position.x).toBeCloseTo(exit.x + speed * 0.01);
    expect(shell.velocity.y).toBeCloseTo(0.1);
    expect(shell.lifetimeSeconds).toBeCloseTo(lifetimeAtExit + 0.01);
    expect(state.lastImpact?.penetrationStatus).toBe('success');
    expect(state.lastImpact).not.toHaveProperty('traversedSegments');
  });

  it('can register a new impact on a separate obstacle later in flight', () => {
    const { state, config } = scene();
    for (let col = 35; col < 40; col++)
      for (let row = 0; row < 40; row++) state.terrain.setMaterial(col, row, Material.Rock);
    const impacts: number[] = [];
    for (let tick = 0; tick < 10; tick++) {
      stepSimulation(state, config, 0.02);
      for (const event of state.events)
        if (event.type === 'projectileImpact') impacts.push(event.position.x);
    }
    expect(impacts).toHaveLength(2);
    expect(impacts[0]).toBeCloseTo(3 - 0.16, 2);
    expect(impacts[1]).toBeCloseTo(7 - 0.16, 2);
  });

  it('leaves a partial channel when energy is exhausted inside Rock', () => {
    const { state, shell, config } = scene(Material.Rock, 12);
    shell.velocity = { x: 20, y: 0 };
    stepSimulation(state, config, 0.1);
    runPenetrationToTerminal(state, config, shell);
    expect(shell.alive).toBe(false);
    expect(state.projectiles).toHaveLength(0);
    expect(state.lastImpact?.penetrationStatus).toBe('stopped');
    expect(state.lastImpact!.penetrationDistanceMeters).toBeGreaterThan(0);
    const event = state.events.find(
      (event) => event.type === 'terrainDamage' && event.operation.type === 'capsule',
    );
    expect(event).toBeDefined();
    if (event?.type !== 'terrainDamage' || event.operation.type !== 'capsule')
      throw new Error('Missing channel');
    expect(event.operation.to).toEqual(shell.position);
    expect(event.operation.to.x).toBeLessThan(4);
    expect(state.terrain.getMaterialAtWorldPosition({ x: 6.1, y: 2.1 })).toBe(Material.Rock);
    expect(state.terrain.getMaterialAtWorldPosition({ x: 3.1, y: 2.1 })).toBe(Material.Air);
    expect(state.lastImpact!.remainingEnergyJ).toBeGreaterThanOrEqual(0);
    expect(state.lastImpact!.exitSpeed).toBe(0);
  });

  it('handles grazing rim contacts even when the center never enters the solid row', () => {
    const { state, shell, config } = scene();
    state.terrain = new TerrainGrid(100, 40, 0.2);
    for (let col = 15; col < 20; col++) state.terrain.setMaterial(col, 15, Material.Rock);
    shell.position.y = 2.9;
    shell.previousPosition = { ...shell.position };
    stepSimulation(state, config, 0.02);
    runPenetrationToTerminal(state, config, shell);
    expect(state.lastImpact?.materialId).toBe(Material.Rock);
    expect(state.lastImpact?.penetrationStatus).toBe('success');
    expect(state.lastImpact!.energyLostJ).toBeGreaterThan(0);
    expect(shell.position.y).toBeCloseTo(2.9);
    stepSimulation(state, config, 0.01);
    expect(state.events).toEqual([]);
  });

  it('never revives an expired shell at a successful exit', () => {
    const { state, shell, config } = scene();
    shell.maxLifetimeSeconds = 0.01;
    stepSimulation(state, config, 0.02);
    expect(state.projectiles).toHaveLength(0);
    expect(shell.alive).toBe(false);
  });

  it('snapshots penetration settings and retains the source profile after switching weapons', () => {
    const { state, shell, config } = scene();
    expect(shell.penetration).toEqual(projectileDefinitions.penetratorShell.penetration);
    expect(shell.penetration).not.toBe(projectileDefinitions.penetratorShell.penetration);
    const snapshot = createGameSnapshot(state);
    expect(snapshot.projectiles[0]!.penetration).not.toBe(shell.penetration);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    stepSimulation(state, config, 0.02, [{ type: 'setWeapon', cannonId: 1, weaponId: 'mortar' }]);
    expect(state.lastImpact?.weaponId).toBe('heavyPenetrator');
    expect(state.lastImpact?.penetrationStatus).toBe('penetrating');
    expect(state.cannon.weaponId).toBe('mortar');
  });
});
