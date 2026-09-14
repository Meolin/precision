import { describe, expect, it } from 'vitest';
import { createProjectile } from '../ballistics/Projectile';
import { advanceProjectile, stepProjectile } from '../ballistics/projectilePhysics';
import { simulateTrajectoryPreview } from '../ballistics/trajectoryPreview';
import { executeCommand } from '../commands/executeCommand';
import { cloneConfig } from '../config/defaultGameConfig';
import { GameRuntime } from '../core/GameRuntime';
import { createGameState } from '../core/GameState';
import { toRadians } from '../math/Vec2';
import { weaponDefinitions } from './weaponDefinitions';
import { resolveWeapon, weaponNumericSettings, withWeaponSetting } from './WeaponSettings';

describe('weapon definitions and spawning', () => {
  it('keeps the original Basic Cannon defaults and known muzzle transform', () => {
    const config = cloneConfig();
    const state = createGameState(config, 12345);
    state.cannon.angleRad = toRadians(60);
    const shell = createProjectile(state.cannon, config, 5, 10);
    expect(shell).toMatchObject({
      id: 5,
      spawnTick: 10,
      weaponId: 'basicCannon',
      projectileDefinitionId: 'basicShell',
      impactDefinitionId: 'basicImpact',
      massKg: 5,
      radius: 0.12,
      gravityScale: 1,
      windInfluence: 1,
      dragCoefficient: 1,
      maxLifetimeSeconds: 20,
    });
    expect(shell.velocity.x).toBeCloseTo(15, 12);
    expect(shell.velocity.y).toBeCloseTo(-25.98076211353316, 12);
    expect(shell.position.x).toBeCloseTo(state.cannon.position.x + 1.2, 12);
    expect(shell.position.y).toBeCloseTo(state.cannon.position.y - 2.078460969082653, 12);
    expect(shell.previousPosition).toEqual(shell.position);
    expect(shell.previousPosition).not.toBe(shell.position);
    expect(resolveWeapon(config, 'basicCannon').weapon.cooldownSeconds).toBe(0);
  });

  it('snapshots all projectile tuning while world forces remain live', () => {
    const config = cloneConfig();
    config.weaponOverrides.basicCannon = {
      projectile: { gravityScale: 0.5, windInfluence: 2, dragCoefficient: 0.25 },
    };
    const cannon = createGameState(config, 12345).cannon;
    const shell = createProjectile(cannon, config, 2, 0);
    config.weaponOverrides.basicCannon = {
      weapon: { muzzleVelocity: 100 },
      projectile: {
        massKg: 40,
        radiusMeters: 0.4,
        gravityScale: 3,
        windInfluence: 0,
        dragCoefficient: 0,
        maxLifetimeSeconds: 1,
      },
    };
    const next = createProjectile(cannon, config, 3, 1);
    expect(shell).toMatchObject({
      massKg: 5,
      radius: 0.12,
      gravityScale: 0.5,
      windInfluence: 2,
      dragCoefficient: 0.25,
      maxLifetimeSeconds: 20,
    });
    expect(next).toMatchObject({
      massKg: 40,
      radius: 0.4,
      gravityScale: 3,
      windInfluence: 0,
      dragCoefficient: 0,
      maxLifetimeSeconds: 1,
    });
    shell.velocity = { x: 0, y: 0 };
    stepProjectile(shell, { gravity: 10, windAcceleration: 2, airDrag: 4 }, 1);
    expect(shell.velocity.x).toBeCloseTo(4 * Math.exp(-1));
    expect(shell.velocity.y).toBeCloseTo(5 * Math.exp(-1));
  });

  it('equips a slower, heavier mortar with a higher initial arc', () => {
    const runtime = new GameRuntime();
    const basic = runtime.getTrajectoryPreview();
    runtime.enqueueCommand({ type: 'setWeapon', cannonId: 1, weaponId: 'mortar' });
    runtime.enqueueCommand({ type: 'fire', cannonId: 1 });
    runtime.advance(1000 / 60);
    const spawn = runtime.getState().events.find((event) => event.type === 'projectileSpawned');
    expect(spawn?.projectile).toMatchObject({
      weaponId: 'mortar',
      projectileDefinitionId: 'mortarShell',
      massKg: 9,
      radius: 0.18,
    });
    expect(Math.hypot(spawn!.projectile.velocity.x, spawn!.projectile.velocity.y)).toBeCloseTo(24);
    expect(runtime.getState().cannon.angleRad).toBeCloseTo(toRadians(70));
    const mortar = runtime.getTrajectoryPreview();
    expect(Math.min(...mortar.points.map((point) => point.y))).toBeLessThan(
      Math.min(...basic.points.map((point) => point.y)),
    );
    expect(mortar.impact).not.toEqual(basic.impact);
  });

  it('keeps overrides isolated per weapon and resets them without mutating definitions', () => {
    const runtime = new GameRuntime();
    const mass = weaponNumericSettings.find((setting) => setting.key === 'massKg')!;
    runtime.updateConfig(withWeaponSetting(runtime.getConfig(), 'mortar', mass, 100));
    expect(resolveWeapon(runtime.getConfig(), 'mortar').projectile.massKg).toBe(50);
    expect(resolveWeapon(runtime.getConfig(), 'basicCannon').projectile.massKg).toBe(5);
    const detached = cloneConfig(runtime.getConfig());
    detached.weaponOverrides.mortar = { weapon: { muzzleVelocity: 1 } };
    expect(resolveWeapon(runtime.getConfig(), 'mortar').weapon.muzzleVelocity).toBe(24);
    expect(Object.isFrozen(weaponDefinitions.mortar)).toBe(true);
    runtime.resetSettings();
    expect(resolveWeapon(runtime.getConfig(), 'mortar').projectile.massKg).toBe(9);
  });
});

describe('weapon commands and preview', () => {
  it('preserves queued fire/equip order and handles invalid serialized IDs', () => {
    const runtime = new GameRuntime();
    runtime.enqueueCommand({ type: 'fire', cannonId: 1 });
    runtime.enqueueCommand({ type: 'setWeapon', cannonId: 1, weaponId: 'mortar' });
    runtime.enqueueCommand({ type: 'fire', cannonId: 1 });
    runtime.advance(1000 / 60);
    expect(runtime.getState().projectiles.map((shell) => shell.weaponId)).toEqual([
      'basicCannon',
      'mortar',
    ]);
    for (const weaponId of ['unknown', '__proto__', 'toString'])
      runtime.enqueueCommand(
        JSON.parse(JSON.stringify({ type: 'setWeapon', cannonId: 1, weaponId })),
      );
    runtime.enqueueCommand({ type: 'setWeapon', cannonId: 99, weaponId: 'basicCannon' });
    runtime.advance(1000 / 60);
    expect(runtime.getState().cannon.weaponId).toBe('mortar');
  });

  it('updates preview immediately on pause without applying queued gameplay commands', () => {
    const runtime = new GameRuntime();
    runtime.setPaused(true);
    const basic = runtime.getTrajectoryPreview();
    runtime.enqueueCommand({ type: 'setWeapon', cannonId: 1, weaponId: 'mortar' });
    const mortar = runtime.getTrajectoryPreview();
    expect(mortar).not.toBe(basic);
    expect(runtime.getState().cannon.weaponId).toBe('basicCannon');
    expect(runtime.getState().tick).toBe(0);
    runtime.enqueueCommand({ type: 'setAim', cannonId: 1, angleRad: toRadians(65) });
    const aimed = runtime.getTrajectoryPreview();
    expect(aimed).not.toBe(mortar);
    runtime.enqueueCommand({ type: 'fire', cannonId: 1 });
    runtime.step();
    expect(runtime.getState().cannon.weaponId).toBe('mortar');
    expect(runtime.getState().projectiles).toHaveLength(1);
    expect(runtime.getTrajectoryPreview()).toBe(aimed);
  });

  it('invalidates preview on weapon change even when the angle is unchanged', () => {
    const runtime = new GameRuntime();
    const basic = runtime.getTrajectoryPreview();
    runtime.enqueueCommand({ type: 'setWeapon', cannonId: 1, weaponId: 'mortar' });
    runtime.enqueueCommand({ type: 'setAim', cannonId: 1, angleRad: toRadians(42) });
    expect(runtime.getTrajectoryPreview()).not.toBe(basic);
  });

  it('enforces simulation-time cooldown, including after switching weapons', () => {
    const runtime = new GameRuntime();
    runtime.setPaused(true);
    runtime.enqueueCommand({ type: 'setWeapon', cannonId: 1, weaponId: 'mortar' });
    runtime.enqueueCommand({ type: 'fire', cannonId: 1 });
    runtime.enqueueCommand({ type: 'fire', cannonId: 1 });
    runtime.step();
    expect(runtime.getState().shotsFired).toBe(1);
    runtime.enqueueCommand({ type: 'setWeapon', cannonId: 1, weaponId: 'basicCannon' });
    runtime.enqueueCommand({ type: 'fire', cannonId: 1 });
    runtime.advance(10000);
    runtime.step();
    expect(runtime.getState().shotsFired).toBe(1);
    for (let tick = 2; tick < 48; tick++) runtime.step();
    runtime.enqueueCommand({ type: 'fire', cannonId: 1 });
    runtime.step();
    expect(runtime.getState().shotsFired).toBe(2);
    expect(runtime.getState().nextEntityId).toBe(4);
    runtime.reset();
    expect(runtime.getState().cannon.nextFireTimeSeconds).toBe(0);
  });

  it.each(['basicCannon', 'mortar'] as const)(
    'uses identical live and preview positions for %s',
    (weaponId) => {
      const config = cloneConfig();
      config.physics = { gravity: 8, windAcceleration: -1.5, airDrag: 0.06 };
      const state = createGameState(config, 12345);
      executeCommand(state, config, { type: 'setWeapon', cannonId: 1, weaponId });
      const preview = simulateTrajectoryPreview(state.cannon, state.terrain, config);
      const before = state.terrain.cells.slice();
      const shell = createProjectile(state.cannon, config, 2, 0);
      const positions = [{ ...shell.position }];
      for (let tick = 0; tick < 1200 && shell.alive; tick++) {
        advanceProjectile(shell, state.terrain, config, 1 / 60);
        positions.push({ ...shell.position });
      }
      for (const point of preview.points) expect(positions).toContainEqual(point);
      expect(preview.impact).toEqual(shell.position);
      expect(preview.flightSeconds).toBe(shell.lifetimeSeconds);
      expect(state.terrain.cells).toEqual(before);
    },
  );
});
