import { describe, expect, it } from 'vitest';
import { createProjectile } from '../ballistics/Projectile';
import { simulateTrajectoryPreview } from '../ballistics/trajectoryPreview';
import { cloneConfig } from '../config/defaultGameConfig';
import { createGameSnapshot } from '../core/GameSnapshot';
import { createGameState } from '../core/GameState';
import { stepSimulation } from '../core/stepSimulation';
import { shapeContact } from './bodyCollision';
import { TerrainGrid } from '../terrain/TerrainGrid';
import { TerrainMaterialId } from '../terrain/TerrainMaterialId';
import { createActivePenetration } from '../impacts/resolvePenetration';
import type { BodyState } from './Body';

function box(): BodyState {
  return {
    id: -1,
    kind: 'dynamic',
    shape: { type: 'box', halfWidth: 1, halfHeight: 0.6 },
    massKg: 2,
    position: { x: 5, y: 5 },
    previousPosition: { x: 5, y: 5 },
    velocity: { x: 0, y: 0 },
    rotationRad: 0,
    previousRotationRad: 0,
    angularVelocityRadPerSecond: 0,
    friction: 0.5,
    restitution: 0.2,
    sleeping: false,
    sleepSeconds: 0,
    color: 0xffffff,
  };
}

describe('rotating bodies and projectiles', () => {
  it('keeps the authoritative body state unchanged during trajectory preview', () => {
    const config = cloneConfig();
    const state = createGameState(config, 123);
    const before = createGameSnapshot(state);
    simulateTrajectoryPreview(state.cannon, state.terrain, config, state.units, state.bodies);
    expect(createGameSnapshot(state)).toEqual(before);
  });

  it('uses the rotated square geometry in contact queries', () => {
    const circle = { type: 'circle' as const, radius: 0.25 };
    const rectangle = { type: 'box' as const, halfWidth: 1, halfHeight: 0.2 };
    expect(shapeContact({ x: 0.8, y: 0 }, circle, { x: 0, y: 0 }, rectangle, 0, 0)).not.toBeNull();
    expect(
      shapeContact({ x: 0.8, y: 0 }, circle, { x: 0, y: 0 }, rectangle, 0, Math.PI / 2),
    ).toBeNull();
  });

  it('places a box contact inside the overlapping faces', () => {
    const contact = shapeContact(
      { x: 0, y: 0 },
      { type: 'box', halfWidth: 1, halfHeight: 1 },
      { x: 0.95, y: 1 },
      { type: 'box', halfWidth: 0.05, halfHeight: 0.05 },
    );
    expect(contact?.normal).toEqual({ x: 0, y: 1 });
    expect(contact?.contactPoint.x).toBeGreaterThanOrEqual(0.9);
    expect(contact?.contactPoint.x).toBeLessThanOrEqual(1);
  });

  it('stops an active penetrator at the first body in its channel', () => {
    const config = cloneConfig();
    config.physics.gravity = 0;
    const state = createGameState(config, 123);
    state.units = [];
    state.terrain = new TerrainGrid(
      100,
      30,
      0.1,
      new Uint8Array(3000).fill(TerrainMaterialId.Soil),
    );
    const shell = createProjectile(
      { ...state.cannon, weaponId: 'heavyPenetrator' },
      config,
      state.nextEntityId++,
      0,
    );
    shell.position = { x: 1, y: 1 };
    shell.previousPosition = { ...shell.position };
    shell.velocity = { x: 100, y: 0 };
    shell.penetrationState = createActivePenetration({
      entryPosition: shell.position,
      velocity: shell.velocity,
      initialEnergyJ: 70000,
      massKg: shell.massKg,
      radiusMeters: shell.radius,
      definition: shell.penetration!,
      terrain: state.terrain,
    })!;
    const body = box();
    body.kind = 'static';
    body.position = { x: 2, y: 1 };
    body.previousPosition = { ...body.position };
    body.shape = { type: 'circle', radius: 0.2 };
    state.bodies = [body];
    state.projectiles = [shell];

    stepSimulation(state, config, 1 / 60);

    expect(
      state.events.some((event) => event.type === 'bodyImpact' && event.bodyId === body.id),
    ).toBe(true);
    expect(shell.position.x).toBeLessThan(2);
    expect(shell.alive).toBe(false);
    expect(state.projectiles).toHaveLength(0);
  });

  it('applies direct damage when an active penetrator reaches an entity', () => {
    const config = cloneConfig();
    config.physics.gravity = 0;
    const state = createGameState(config, 123);
    state.terrain = new TerrainGrid(
      100,
      30,
      0.1,
      new Uint8Array(3000).fill(TerrainMaterialId.Soil),
    );
    state.units = [
      {
        id: 101,
        teamId: 2,
        position: { x: 2, y: 1 },
        health: { current: 100, max: 100 },
        hitbox: { type: 'circle', radiusMeters: 0.2 },
        alive: true,
      },
    ];
    state.bodies = [];
    const shell = createProjectile(
      { ...state.cannon, weaponId: 'heavyPenetrator' },
      config,
      state.nextEntityId++,
      0,
    );
    shell.position = { x: 1, y: 1 };
    shell.previousPosition = { ...shell.position };
    shell.velocity = { x: 100, y: 0 };
    shell.penetrationState = createActivePenetration({
      entryPosition: shell.position,
      velocity: shell.velocity,
      initialEnergyJ: 70000,
      massKg: shell.massKg,
      radiusMeters: shell.radius,
      definition: shell.penetration!,
      terrain: state.terrain,
    })!;
    state.projectiles = [shell];

    stepSimulation(state, config, 1 / 60);

    expect(
      state.events.some((event) => event.type === 'entityImpact' && event.targetEntityId === 101),
    ).toBe(true);
    expect(state.units[0]!.health.current).toBeLessThan(100);
    expect(shell.alive).toBe(false);
  });

  it('sweeps a shell into a body and transfers off-center angular impulse', () => {
    const config = cloneConfig();
    const state = createGameState(config, 123);
    const body = box();
    state.bodies = [body];
    const shell = createProjectile(state.cannon, config, state.nextEntityId++, state.tick);
    shell.position = { x: 1, y: 4.6 };
    shell.previousPosition = { ...shell.position };
    shell.velocity = { x: 100, y: 0 };
    state.projectiles.push(shell);
    stepSimulation(state, config, 0.05);
    expect(
      state.events.some((event) => event.type === 'bodyImpact' && event.bodyId === body.id),
    ).toBe(true);
    expect(body.velocity.x).toBeGreaterThan(0);
    expect(Math.abs(body.angularVelocityRadPerSecond)).toBeGreaterThan(0);
    expect(state.projectiles).toHaveLength(0);
    stepSimulation(state, config, 0.05);
    expect(body.rotationRad).not.toBe(0);
    const snapshot = createGameSnapshot(state);
    expect(snapshot.bodies[0]?.rotationRad).toBe(body.rotationRad);
  });
});
