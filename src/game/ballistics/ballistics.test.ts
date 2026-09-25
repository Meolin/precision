import { describe, expect, it } from 'vitest';
import { cloneConfig } from '../config/defaultGameConfig';
import { createGameState } from '../core/GameState';
import { TerrainGrid } from '../terrain/TerrainGrid';
import { createProjectile, type ProjectileState } from './Projectile';
import { projectileDefinitions } from './projectileDefinitions';
import { advanceProjectile, calculateKineticEnergy, stepProjectile } from './projectilePhysics';
import { simulateTrajectoryPreview } from './trajectoryPreview';

function projectile(): ProjectileState {
  return {
    id: 2,
    ownerEntityId: 1,
    teamId: 1,
    hasExitedOwnerHitbox: true,
    spawnTick: 0,
    weaponId: 'basicCannon',
    projectileDefinitionId: 'basicShell',
    impactDefinitionId: 'basicImpact',
    gravityScale: 1,
    windInfluence: 1,
    dragCoefficient: 1,
    position: { x: 2, y: 3 },
    previousPosition: { x: 2, y: 3 },
    velocity: { x: 10, y: -5 },
    massKg: 5,
    radius: 0.12,
    lifetimeSeconds: 0,
    maxLifetimeSeconds: 20,
    alive: true,
    ricochetCount: 0,
    ricochet: { ...projectileDefinitions.basicShell.ricochet },
  };
}

describe('projectile physics', () => {
  it('moves in a straight line without forces', () => {
    const shell = projectile();
    for (let tick = 0; tick < 60; tick++)
      stepProjectile(shell, { gravity: 0, windAcceleration: 0, airDrag: 0 }, 1 / 60);
    expect(shell.position.x).toBeCloseTo(12);
    expect(shell.position.y).toBeCloseTo(-2);
    expect(shell.velocity).toEqual({ x: 10, y: -5 });
    expect(shell.lifetimeSeconds).toBeCloseTo(1);
  });

  it('applies gravity to vertical velocity using fixed dt', () => {
    const shell = projectile();
    stepProjectile(shell, { gravity: 9.81, windAcceleration: 0, airDrag: 0 }, 0.5);
    expect(shell.velocity.y).toBeCloseTo(-0.095);
    expect(shell.position.y).toBeCloseTo(2.9525);
    expect(shell.previousPosition).toEqual({ x: 2, y: 3 });
  });

  it('applies signed wind as horizontal acceleration', () => {
    const shell = projectile();
    stepProjectile(shell, { gravity: 0, windAcceleration: -4, airDrag: 0 }, 0.5);
    expect(shell.velocity.x).toBe(8);
    expect(shell.position.x).toBe(6);
  });

  it('drag reduces speed without reversing direction', () => {
    const shell = projectile();
    stepProjectile(shell, { gravity: 0, windAcceleration: 0, airDrag: 2 }, 1);
    expect(shell.velocity.x).toBeCloseTo(10 * Math.exp(-2));
    expect(shell.velocity.y).toBeLessThan(0);
    expect(calculateKineticEnergy(shell.massKg, shell.velocity)).toBeLessThan(312.5);
  });

  it('calculates kinetic energy using both velocity components', () => {
    expect(calculateKineticEnergy(5, { x: 30, y: 0 })).toBe(2250);
    expect(calculateKineticEnergy(2, { x: 3, y: 4 })).toBe(25);
    expect(calculateKineticEnergy(5, { x: 60, y: 0 })).toBe(9000);
  });

  it('copies projectile properties at spawn', () => {
    const config = cloneConfig();
    const state = createGameState(config, 12345);
    const shell = createProjectile(state.cannon, config, 2, 7);
    config.weaponOverrides.basicCannon = {
      weapon: { muzzleVelocity: 100 },
      projectile: { massKg: 20, radiusMeters: 0.4, maxLifetimeSeconds: 1 },
    };
    expect(shell.massKg).toBe(5);
    expect(shell.radius).toBe(0.12);
    expect(Math.hypot(shell.velocity.x, shell.velocity.y)).toBeCloseTo(30);
    expect(shell.maxLifetimeSeconds).toBe(20);
    expect(shell.spawnTick).toBe(7);
  });

  it('expires shells outside side/bottom bounds and at their own lifetime', () => {
    const config = cloneConfig();
    const terrain = new TerrainGrid(600, 320, 0.2);
    const shell = projectile();
    shell.position.x = config.world.widthMeters + 1;
    advanceProjectile(shell, terrain, config, 1 / 60);
    expect(shell.alive).toBe(false);
    const expired = projectile();
    expired.maxLifetimeSeconds = 0.01;
    advanceProjectile(expired, terrain, config, 1 / 60);
    expect(expired.alive).toBe(false);
  });

  it('allows shells above the visible sky to return', () => {
    const config = cloneConfig();
    const shell = projectile();
    shell.position.y = -1;
    advanceProjectile(shell, new TerrainGrid(600, 320, 0.2), config, 1 / 60);
    expect(shell.alive).toBe(true);
  });
});

describe('trajectory preview', () => {
  it('predicts the live contact point and does not damage terrain', () => {
    const config = cloneConfig();
    config.terrain.cellSizeMeters = 0.2;
    const state = createGameState(config, 12345);
    const before = state.terrain.cells.slice();
    const preview = simulateTrajectoryPreview(state.cannon, state.terrain, config);
    const shell = createProjectile(state.cannon, config, 2, 0);
    let contact = null;
    for (
      let tick = 0;
      tick < config.preview.maxSeconds * config.simulation.tickRate && shell.alive;
      tick++
    ) {
      contact = advanceProjectile(shell, state.terrain, config, 1 / config.simulation.tickRate);
      if (contact) break;
    }
    expect(preview.impact).not.toBeNull();
    expect(preview.impact).toEqual(contact?.position);
    expect(state.terrain.cells).toEqual(before);
    expect(preview.points.length).toBeLessThanOrEqual(config.preview.maxPoints);
    expect(preview.flightSeconds).toBeLessThanOrEqual(
      config.preview.maxSeconds + 1 / config.simulation.tickRate,
    );
  });

  it('changes with gravity and wind', () => {
    const config = cloneConfig();
    const state = createGameState(config, 12345);
    const first = simulateTrajectoryPreview(state.cannon, state.terrain, config);
    config.physics.gravity = 20;
    expect(simulateTrajectoryPreview(state.cannon, state.terrain, config).points).not.toEqual(
      first.points,
    );
    config.physics.windAcceleration = -5;
    expect(simulateTrajectoryPreview(state.cannon, state.terrain, config).points).not.toEqual(
      first.points,
    );
  });
});
