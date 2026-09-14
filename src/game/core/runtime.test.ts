import { describe, expect, it } from 'vitest';
import { cloneConfig } from '../config/defaultGameConfig';
import { toRadians } from '../math/Vec2';
import { resolveWeapon } from '../weapons/WeaponSettings';
import { GameRuntime } from './GameRuntime';
import { createGameSnapshot } from './GameSnapshot';
import { SimulationClock } from './SimulationClock';

describe('fixed simulation clock', () => {
  it('accumulates fractional frames with an interpolation alpha', () => {
    const clock = new SimulationClock();
    let ticks = 0;
    clock.advance(10, 60, 250, () => ticks++);
    expect(ticks).toBe(0);
    expect(clock.getAlpha(60)).toBeCloseTo(0.6);
    clock.advance(10, 60, 250, () => ticks++);
    expect(ticks).toBe(1);
    expect(clock.getAlpha(60)).toBeCloseTo(0.2);
  });

  it('clamps long frame gaps and ignores invalid deltas', () => {
    const clock = new SimulationClock();
    let ticks = 0;
    clock.advance(60_000, 60, 250, () => ticks++);
    clock.advance(Number.NaN, 60, 250, () => ticks++);
    clock.advance(-100, 60, 250, () => ticks++);
    expect(ticks).toBe(15);
  });
});

describe('game runtime', () => {
  it('queues serializable commands and applies aim before fire', () => {
    const runtime = new GameRuntime();
    runtime.enqueueCommand({ type: 'setAim', cannonId: 1, angleRad: toRadians(50) });
    runtime.enqueueCommand({ type: 'fire', cannonId: 1 });
    expect(runtime.getState().projectiles).toHaveLength(0);
    runtime.advance(1000 / 60);
    const state = runtime.getState();
    expect(state.cannon.angleRad).toBeCloseTo(toRadians(50));
    expect(state.projectiles).toHaveLength(1);
    expect(state.projectiles[0]?.velocity.x).toBeCloseTo(Math.cos(toRadians(50)) * 30);
    expect(state.events[0]?.type).toBe('projectileSpawned');
    expect(runtime.pendingCommands).toBe(0);
  });

  it('clamps aim and ignores invalid commands and unknown cannon IDs', () => {
    const runtime = new GameRuntime();
    runtime.enqueueCommand({ type: 'setAim', cannonId: 1, angleRad: 100 });
    runtime.enqueueCommand({ type: 'setAim', cannonId: 2, angleRad: 0 });
    runtime.enqueueCommand({ type: 'fire', cannonId: 2 });
    runtime.advance(1000 / 60);
    expect(runtime.getState().cannon.angleRad).toBeCloseTo(toRadians(85));
    expect(runtime.getState().shotsFired).toBe(0);
    runtime.enqueueCommand({ type: 'setAim', cannonId: 1, angleRad: Number.NaN });
    runtime.advance(1000 / 60);
    expect(runtime.getState().cannon.angleRad).toBeCloseTo(toRadians(85));
  });

  it('pauses without accumulating time and steps exactly one tick', () => {
    const runtime = new GameRuntime();
    runtime.setPaused(true);
    runtime.enqueueCommand({ type: 'fire', cannonId: 1 });
    runtime.advance(1000);
    expect(runtime.getState().tick).toBe(0);
    runtime.step();
    expect(runtime.getState().tick).toBe(1);
    expect(runtime.getState().projectiles).toHaveLength(1);
    runtime.advance(1000);
    expect(runtime.getState().tick).toBe(1);
    expect(runtime.interpolationAlpha).toBe(1);
    runtime.setPaused(false);
    runtime.advance(1000 / 60);
    expect(runtime.getState().tick).toBe(2);
  });

  it('resets scene and queue with the same seed, while preserving settings', () => {
    const runtime = new GameRuntime();
    const initial = createGameSnapshot(runtime.getState());
    runtime.enqueueCommand({ type: 'fire', cannonId: 1 });
    runtime.advance(100);
    runtime.enqueueCommand({ type: 'fire', cannonId: 1 });
    const config = cloneConfig(runtime.getConfig());
    config.physics.gravity = 15;
    runtime.updateConfig(config);
    runtime.reset();
    expect(createGameSnapshot(runtime.getState())).toEqual(initial);
    expect(runtime.pendingCommands).toBe(0);
    expect(runtime.getConfig().physics.gravity).toBe(15);
    runtime.newTerrain();
    expect(runtime.getState().seed).toBe(12346);
    expect(runtime.getState().terrain.cells).not.toEqual(new Uint8Array(initial.terrain.cells));
  });

  it('uses actual impact energy, removes the projectile and applies semantic damage', () => {
    const runtime = new GameRuntime();
    const preview = runtime.getTrajectoryPreview();
    runtime.enqueueCommand({ type: 'fire', cannonId: 1 });
    for (let tick = 0; tick < 1200 && !runtime.getState().lastImpact; tick++)
      runtime.advance(1000 / 60);
    const state = runtime.getState();
    expect(state.lastImpact).not.toBeNull();
    expect(state.lastImpact?.position).toEqual(preview.impact);
    expect(state.lastImpact?.kineticEnergyJ).toBeGreaterThan(0);
    expect(state.lastImpact?.removedCells).toBeGreaterThan(0);
    expect(state.events.some((event) => event.type === 'terrainDamage')).toBe(true);
    expect(state.terrain.version).toBeGreaterThan(0);
    expect(state.projectiles).toHaveLength(0);
    expect(runtime.getTrajectoryPreview()).not.toBe(preview);
  });

  it('reproduces identical command sequences at different rendering rates', () => {
    const first = new GameRuntime();
    const second = new GameRuntime();
    first.enqueueCommand({ type: 'fire', cannonId: 1 });
    second.enqueueCommand({ type: 'fire', cannonId: 1 });
    for (let frame = 0; frame < 60; frame++) first.advance(1000 / 60);
    for (let frame = 0; frame < 144; frame++) second.advance(1000 / 144);
    expect(createGameSnapshot(first.getState())).toEqual(createGameSnapshot(second.getState()));
  });

  it('snapshots are detached and JSON serializable', () => {
    const runtime = new GameRuntime();
    runtime.enqueueCommand({ type: 'fire', cannonId: 1 });
    runtime.advance(1000 / 60);
    const snapshot = createGameSnapshot(runtime.getState());
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    const originalX = snapshot.projectiles[0]?.position.x;
    runtime.advance(100);
    expect(snapshot.projectiles[0]?.position.x).toBe(originalX);
    expect(runtime.getState().projectiles[0]?.position.x).not.toBe(originalX);
  });

  it('validates settings and invalidates cached previews immediately', () => {
    const runtime = new GameRuntime();
    const original = runtime.getTrajectoryPreview();
    expect(runtime.getTrajectoryPreview()).toBe(original);
    const config = cloneConfig(runtime.getConfig());
    config.physics.gravity = Number.NaN;
    config.weaponOverrides.basicCannon = { projectile: { massKg: -2 } };
    config.weaponOverrides.basicCannon.impact = { baseRadiusMeters: 3, maxRadiusMeters: 1 };
    runtime.updateConfig(config);
    expect(runtime.getConfig().physics.gravity).toBe(9.81);
    expect(resolveWeapon(runtime.getConfig(), 'basicCannon').projectile.massKg).toBe(0.1);
    expect(
      resolveWeapon(runtime.getConfig(), 'basicCannon').impact.terrainDamage.maxRadiusMeters,
    ).toBe(3);
    expect(runtime.getTrajectoryPreview()).not.toBe(original);
    runtime.resetSettings();
    expect(runtime.getConfig()).toEqual(cloneConfig());
  });

  it('keeps earlier projectile snapshots when settings change', () => {
    const runtime = new GameRuntime();
    runtime.enqueueCommand({ type: 'fire', cannonId: 1 });
    runtime.advance(1000 / 60);
    const config = cloneConfig(runtime.getConfig());
    config.weaponOverrides.basicCannon = {
      projectile: { massKg: 10 },
      weapon: { muzzleVelocity: 40 },
    };
    runtime.updateConfig(config);
    runtime.enqueueCommand({ type: 'fire', cannonId: 1 });
    runtime.advance(1000 / 60);
    expect(runtime.getState().projectiles.map((shell) => shell.massKg)).toEqual([5, 10]);
    expect(runtime.getState().projectiles.map((shell) => shell.id)).toEqual([2, 3]);
  });
});
