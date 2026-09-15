import { describe, expect, it } from 'vitest';
import { createProjectile } from '../ballistics/Projectile';
import { advanceProjectile, calculateKineticEnergy } from '../ballistics/projectilePhysics';
import { cloneConfig } from '../config/defaultGameConfig';
import { createGameSnapshot } from '../core/GameSnapshot';
import { createGameState } from '../core/GameState';
import { stepSimulation } from '../core/stepSimulation';
import { applyTerrainDamage } from '../terrain/damageTerrain';
import { TerrainGrid } from '../terrain/TerrainGrid';
import { createImpactEvent, type ImpactEvent } from './ImpactEvent';
import { impactDefinitions } from './impactDefinitions';
import { craterRadius, resolveImpact } from './resolveImpact';

const impact: ImpactEvent = {
  type: 'projectileImpact',
  tick: 7,
  projectileId: 2,
  weaponId: 'basicCannon',
  projectileDefinitionId: 'basicShell',
  impactDefinitionId: 'basicImpact',
  position: { x: 5, y: 5 },
  velocity: { x: 6, y: 8 },
  speed: 10,
  kineticEnergyJ: 100,
  surfaceNormal: { x: 0, y: -1 },
  contactPoint: { x: 5, y: 5 },
};

function contactScene() {
  const config = cloneConfig();
  config.physics = { gravity: 0, windAcceleration: 0, airDrag: 0 };
  const state = createGameState(config, 12345);
  state.terrain = new TerrainGrid(20, 20, 1);
  for (let y = 5; y < 20; y++) for (let x = 0; x < 20; x++) state.terrain.setSolid(x, y, true);
  const shell = createProjectile(state.cannon, config, 2, 0);
  shell.position = { x: 5, y: 4 };
  shell.previousPosition = { ...shell.position };
  shell.velocity = { x: 0, y: 10 };
  shell.massKg = 2;
  state.projectiles.push(shell);
  state.tick = 7;
  return { config, state, shell };
}

describe('impact pipeline', () => {
  it('centralizes kinetic energy: 2 kg at 10 m/s is 100 J', () => {
    expect(calculateKineticEnergy(2, { x: 6, y: 8 })).toBe(100);
  });

  it('collision alone never mutates terrain and captures detached contact facts', () => {
    const { config, state, shell } = contactScene();
    const cells = state.terrain.cells.slice();
    const hit = advanceProjectile(shell, state.terrain, config, 0.2)!;
    expect(hit).not.toBeNull();
    const event = createImpactEvent(shell, { ...hit, normal: { x: 0, y: -1 } }, 7);
    expect(event).toMatchObject({
      type: 'projectileImpact',
      tick: 7,
      projectileId: 2,
      projectileDefinitionId: 'basicShell',
      velocity: { x: 0, y: 10 },
      speed: 10,
      kineticEnergyJ: 100,
      surfaceNormal: { x: 0, y: -1 },
    });
    expect(event.position).toEqual(hit.position);
    expect(event.position.y).toBeCloseTo(4.88, 2);
    expect(shell.alive).toBe(true);
    expect(state.terrain.cells).toEqual(cells);
    shell.velocity.y = 0;
    shell.position.x = 0;
    expect(event.velocity.y).toBe(10);
    expect(event.position.x).toBe(5);
  });

  it('resolves a known event into semantic damage and supports disabled destruction', () => {
    const { state, shell } = contactScene();
    const resolution = resolveImpact(impact, impactDefinitions.basicImpact, shell, state.terrain);
    const damage = resolution.terrainDamageEvents[0];
    expect(resolution.type).toBe('stop');
    expect(damage).toEqual({
      type: 'terrainDamage',
      tick: 7,
      sourceProjectileId: 2,
      operation: { type: 'circle', center: { x: 5, y: 5 }, radiusMeters: 1.05 },
      energyJ: 100,
    });
    expect(damage?.operation.type).toBe('circle');
    if (damage?.operation.type === 'circle')
      expect(damage.operation.center).not.toBe(impact.position);
    expect(
      resolveImpact(
        impact,
        {
          id: 'basicImpact',
          entityDamage: impactDefinitions.basicImpact.entityDamage,
          terrainDamage: { ...impactDefinitions.basicImpact.terrainDamage, enabled: false },
        },
        shell,
        state.terrain,
      ).terrainDamageEvents,
    ).toEqual([]);
    expect(craterRadius(-100, impactDefinitions.basicImpact.terrainDamage)).toBe(0.8);
    expect(craterRadius(1e12, impactDefinitions.basicImpact.terrainDamage)).toBe(3);
  });

  it('emits impact then damage once, persists telemetry and clears events next tick', () => {
    const { config, state } = contactScene();
    const replayTerrain = new TerrainGrid(20, 20, 1, state.terrain.cells.slice());
    stepSimulation(state, config, 0.2);
    expect(state.events.map((event) => event.type)).toEqual([
      'projectileImpact',
      'impactResolved',
      'terrainDamage',
    ]);
    const damage = state.events.find((event) => event.type === 'terrainDamage')!;
    expect(damage.tick).toBe(7);
    expect(state.projectiles).toHaveLength(0);
    expect(state.lastImpact).toMatchObject({ kineticEnergyJ: 100, craterRadiusMeters: 1.05 });
    expect(state.lastImpact!.removedCells).toBeGreaterThan(0);
    applyTerrainDamage(replayTerrain, JSON.parse(JSON.stringify(damage)));
    expect(replayTerrain.cells).toEqual(state.terrain.cells);
    const lastImpact = state.lastImpact;
    stepSimulation(state, config, 0.2);
    expect(state.events).toEqual([]);
    expect(state.lastImpact).toBe(lastImpact);
  });

  it('uses impact-time tuning for the source weapon after equipment changes', () => {
    const { config, state } = contactScene();
    config.weaponOverrides.basicCannon = {
      impact: { baseRadiusMeters: 2, energyScale: 0, maxRadiusMeters: 3 },
    };
    stepSimulation(state, config, 0.2, [{ type: 'setWeapon', cannonId: 1, weaponId: 'mortar' }]);
    expect(state.cannon.weaponId).toBe('mortar');
    expect(state.lastImpact).toMatchObject({
      weaponId: 'basicCannon',
      projectileDefinitionId: 'basicShell',
      craterRadiusMeters: 2,
    });
  });

  it('preserves MVP ordering when two shells reach the same surface in one tick', () => {
    const { config, state, shell } = contactScene();
    state.projectiles.push({
      ...shell,
      id: 3,
      position: { ...shell.position },
      previousPosition: { ...shell.position },
      velocity: { ...shell.velocity },
    });
    stepSimulation(state, config, 0.1);
    expect(state.events.filter((event) => event.type === 'projectileImpact')).toHaveLength(1);
    expect(state.projectiles.map((projectile) => projectile.id)).toEqual([3]);
  });

  it('does not create impact events for lifetime expiration in empty space', () => {
    const { config, state, shell } = contactScene();
    state.terrain = new TerrainGrid(20, 20, 1);
    shell.maxLifetimeSeconds = 0.1;
    stepSimulation(state, config, 0.2);
    expect(state.projectiles).toHaveLength(0);
    expect(state.events).toEqual([]);
    expect(state.lastImpact).toBeNull();
  });

  it('snapshots impact vectors independently and serializes event data', () => {
    const { config, state } = contactScene();
    stepSimulation(state, config, 0.2);
    state.lastImpact!.surfaceNormal = { x: 0, y: -1 };
    const snapshot = createGameSnapshot(state);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    expect(JSON.parse(JSON.stringify(state.events))).toEqual(state.events);
    state.lastImpact!.position.x = 0;
    state.lastImpact!.velocity.y = 0;
    state.lastImpact!.surfaceNormal.y = 0;
    expect(snapshot.lastImpact).toMatchObject({
      position: { x: 5 },
      velocity: { y: 10 },
      surfaceNormal: { y: -1 },
    });
  });
});
