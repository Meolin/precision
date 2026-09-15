import { describe, expect, it } from 'vitest';
import { createProjectile } from '../ballistics/Projectile';
import { cloneConfig } from '../config/defaultGameConfig';
import { createGameSnapshot } from '../core/GameSnapshot';
import { createGameState } from '../core/GameState';
import { stepSimulation } from '../core/stepSimulation';
import { GameRuntime } from '../core/GameRuntime';
import { executeCommand } from '../commands/executeCommand';
import { TerrainGrid } from '../terrain/TerrainGrid';
import { applyEntityDamage } from './applyEntityDamage';
import { createEntityImpactEvent } from './EntityImpactEvent';
import { resolveEntityDamage } from './resolveEntityDamage';
import { simulateTrajectoryPreview } from '../ballistics/trajectoryPreview';
import { cloneUnit } from '../entities/UnitState';

function scene() {
  const config = cloneConfig();
  config.physics.gravity = 0;
  const state = createGameState(config, 12345);
  state.terrain = new TerrainGrid(120, 64, 1);
  const target = state.units[1]!;
  target.position = { x: 10, y: 10 };
  target.hitbox.radiusMeters = 1;
  const shell = createProjectile(state.cannon, config, state.nextEntityId++, 0);
  shell.position = { x: 0, y: 10 };
  shell.velocity = { x: 20, y: 0 };
  const impact = createEntityImpactEvent(
    shell,
    {
      type: 'entity',
      entityId: target.id,
      fraction: 0.5,
      position: { x: 9, y: 10 },
      normal: { x: -1, y: 0 },
    },
    0,
  );
  return { config, state, target, shell, impact };
}

describe('damage resolver and health', () => {
  const definition = { enabled: true, energyToDamageScale: 0.01, minDamage: 1, maxDamage: 60 };
  it('converts 1000 J to 10 damage without mutating input', () => {
    const { impact } = scene();
    expect(impact.kineticEnergyJ).toBe(1000);
    const before = JSON.stringify(impact);
    expect(resolveEntityDamage(impact, definition).damage).toBe(10);
    expect(JSON.stringify(impact)).toBe(before);
  });
  it('clamps minimum/maximum and honors disabled damage', () => {
    const { impact } = scene();
    expect(resolveEntityDamage({ ...impact, kineticEnergyJ: 0 }, definition).damage).toBe(1);
    expect(resolveEntityDamage({ ...impact, kineticEnergyJ: 1e12 }, definition).damage).toBe(60);
    expect(resolveEntityDamage(impact, { ...definition, enabled: false }).damage).toBe(0);
  });
  it('subtracts health, clamps death, ignores invalid damage and dead targets', () => {
    const { state, target, impact } = scene();
    const damage = { ...resolveEntityDamage(impact, definition), damage: 30 };
    expect(applyEntityDamage(state.units, damage)).toEqual({
      healthBefore: 100,
      healthAfter: 70,
      result: 'HIT',
    });
    expect(applyEntityDamage(state.units, { ...damage, damage: NaN })).toBeNull();
    expect(applyEntityDamage(state.units, { ...damage, damage: -10 })).toBeNull();
    target.health.current = 20;
    expect(applyEntityDamage(state.units, damage)).toEqual({
      healthBefore: 20,
      healthAfter: 0,
      result: 'DESTROYED',
    });
    expect(target.alive).toBe(false);
    expect(applyEntityDamage(state.units, damage)).toBeNull();
  });
});

describe('entity combat integration', () => {
  it.each(['basicCannon', 'mortar', 'heavyPenetrator'] as const)(
    '%s direct hits with explosions disabled stop and never damage terrain',
    (weaponId) => {
      const { config, state, target } = scene();
      state.cannon.weaponId = weaponId;
      config.weaponOverrides[weaponId] = { explosion: { enabled: false } };
      const shell = createProjectile(state.cannon, config, state.nextEntityId++, 0);
      shell.position = { x: 0, y: 10 };
      shell.velocity = { x: 1200, y: 0 };
      state.projectiles = [shell];
      const cells = state.terrain.cells.slice();
      stepSimulation(state, config, 1 / 60);
      expect(state.events.map((event) => event.type)).toEqual(['entityImpact', 'entityDamage']);
      expect(state.lastEntityImpact).toMatchObject({
        targetEntityId: target.id,
        weaponId,
        ownerEntityId: 1,
      });
      expect(target.health.current).toBeLessThan(100);
      expect(shell.alive).toBe(false);
      expect(state.projectiles).toHaveLength(0);
      expect(state.terrain.cells).toEqual(cells);
      expect(state.lastImpact).toBeNull();
      stepSimulation(state, config, 1 / 60);
      expect(state.events).toEqual([]);
      expect(state.lastEntityImpact).not.toBeNull();
    },
  );
  it('permits friendly fire and a second projectile passes a unit killed in the same tick', () => {
    const { config, state, target, shell } = scene();
    target.teamId = shell.teamId;
    target.health.current = 5;
    const second = {
      ...shell,
      id: state.nextEntityId++,
      position: { ...shell.position },
      velocity: { ...shell.velocity },
    };
    state.projectiles = [shell, second];
    stepSimulation(state, config, 1);
    expect(target.alive).toBe(false);
    expect(state.lastEntityImpact?.result).toBe('DESTROYED');
    expect(state.events.filter((event) => event.type === 'entityImpact')).toHaveLength(1);
    expect(state.projectiles).toEqual([second]);
    expect(second.position.x).toBe(20);
  });
  it('rejects fire/aim/equip commands for a destroyed shooter', () => {
    const { config, state } = scene();
    state.cannon.alive = false;
    state.cannon.health.current = 0;
    const before = cloneUnit(state.cannon);
    executeCommand(state, config, { type: 'fire', cannonId: 1 });
    executeCommand(state, config, { type: 'setWeapon', cannonId: 1, weaponId: 'mortar' });
    executeCommand(state, config, { type: 'setAim', cannonId: 1, angleRad: 1 });
    expect(state.cannon).toEqual(before);
    expect(state.projectiles).toHaveLength(0);
  });
  it('keeps snapshots and events detached, serializable and deterministic', () => {
    const { config, state, shell } = scene();
    state.projectiles = [shell];
    stepSimulation(state, config, 1);
    const snapshot = createGameSnapshot(state);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    expect(JSON.parse(JSON.stringify(state.events))).toEqual(state.events);
    const event = state.events[0];
    shell.position.x = -10;
    expect(event?.type).toBe('entityImpact');
    if (event?.type === 'entityImpact') expect(event.position.x).toBeCloseTo(8.88);
    snapshot.units[1]!.health.current = 0;
    snapshot.cannon.hitbox.radiusMeters = 50;
    snapshot.lastEntityImpact!.surfaceNormal.x = 50;
    expect(state.units[1]!.health.current).toBe(90);
    expect(state.cannon.hitbox.radiusMeters).toBe(1.1);
    expect(state.lastEntityImpact!.surfaceNormal.x).toBe(-1);
    expect(state.units[0]).toBe(state.cannon);
  });
  it('preview uses the same entity contact and does not mutate units or terrain', () => {
    const { config, state, target } = scene();
    state.cannon.position = { x: 2, y: 10 };
    state.cannon.angleRad = 0;
    const before = createGameSnapshot(state);
    const preview = simulateTrajectoryPreview(state.cannon, state.terrain, config, state.units);
    expect(createGameSnapshot(state)).toEqual(before);
    executeCommand(state, config, { type: 'fire', cannonId: 1 });
    for (let i = 0; i < 100 && state.projectiles.length; i++) stepSimulation(state, config, 1 / 60);
    expect(state.lastEntityImpact?.targetEntityId).toBe(target.id);
    expect(preview.impact).toEqual(state.lastEntityImpact?.position);
  });
  it('initial scene has two distinct units and preview cache observes position and death', () => {
    const runtime = new GameRuntime();
    const state = runtime.getState();
    expect(state.units.map((unit) => unit.id)).toEqual([1, 2]);
    const initial = runtime.getTrajectoryPreview();
    state.units[1]!.position.x -= 1;
    expect(runtime.getTrajectoryPreview()).not.toBe(initial);
    const moved = runtime.getTrajectoryPreview();
    state.units[1]!.alive = false;
    expect(runtime.getTrajectoryPreview()).not.toBe(moved);
    runtime.reset();
    expect(
      runtime.getState().units.every((unit) => unit.alive && unit.health.current === 100),
    ).toBe(true);
  });
});
