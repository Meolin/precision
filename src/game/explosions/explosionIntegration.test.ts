import { describe, expect, it } from 'vitest';
import { createProjectile } from '../ballistics/Projectile';
import { simulateTrajectoryPreview } from '../ballistics/trajectoryPreview';
import { cloneConfig } from '../config/defaultGameConfig';
import { GameRuntime } from '../core/GameRuntime';
import { createGameState } from '../core/GameState';
import { createGameSnapshot } from '../core/GameSnapshot';
import { stepSimulation } from '../core/stepSimulation';
import { cloneUnit, spawnTarget } from '../entities/UnitState';
import { TerrainGrid } from '../terrain/TerrainGrid';
import { applyTerrainDamage } from '../terrain/damageTerrain';
import type { WeaponId } from '../weapons/WeaponDefinition';
import { isBlastPathOccluded } from './isBlastPathOccluded';

function scene(weaponId: WeaponId = 'mortar') {
  const config = cloneConfig();
  config.physics = { gravity: 0, windAcceleration: 0, airDrag: 0 };
  const state = createGameState(config, 12345);
  const target = spawnTarget(state.terrain, 2);
  delete target.movement;
  state.units = [state.cannon, target];
  state.terrain = new TerrainGrid(160, 120, 0.25);
  state.cannon.grounding.terrainVersion = state.terrain.version;
  state.cannon.position = { x: 30, y: 10 };
  state.cannon.weaponId = weaponId;
  target.position = { x: 10, y: 10 };
  target.hitbox.radiusMeters = 1;
  const neighbor = { ...cloneUnit(target), id: 4, position: { x: 12, y: 11 } };
  state.units.push(neighbor);
  state.nextEntityId = 10;
  const shell = createProjectile(state.cannon, config, state.nextEntityId++, 0);
  shell.position = { x: 0, y: 10 };
  shell.previousPosition = { ...shell.position };
  shell.velocity = { x: 1200, y: 0 };
  state.projectiles.push(shell);
  return { config, state, shell, target, neighbor };
}

describe('explosion impact pipeline', () => {
  it('stacks direct and AoE damage, then applies exactly one explosion crater', () => {
    const { state, config, target, neighbor, shell } = scene();
    stepSimulation(state, config, 1 / 60);
    expect(state.events.map((event) => event.type)).toEqual([
      'entityImpact',
      'entityDamage',
      'explosion',
      'entityDamage',
      'entityDamage',
      'terrainDamage',
      'explosionResolved',
    ]);
    const hits = state.events.filter((event) => event.type === 'entityDamage');
    expect(hits.map((event) => event.damageKind)).toEqual(['direct', 'explosion', 'explosion']);
    expect(hits[0]?.damage).toBe(25);
    expect(hits[1]?.damage).toBe(60);
    expect(target.health.current).toBe(15);
    expect(neighbor.health.current).toBeCloseTo(100 - hits[2]!.damage);
    expect(state.events.filter((event) => event.type === 'terrainDamage')).toHaveLength(1);
    expect(shell.alive).toBe(false);
    expect(state.projectiles).toEqual([]);
    expect(JSON.parse(JSON.stringify(state.events))).toEqual(state.events);
    stepSimulation(state, config, 1 / 60);
    expect(state.events).toEqual([]);
  });
  it('skips a target killed by the direct hit, but still damages its neighbor', () => {
    const { state, config, target, neighbor } = scene();
    target.health.current = 10;
    stepSimulation(state, config, 1 / 60);
    expect(target.alive).toBe(false);
    expect(target.health.current).toBe(0);
    const hits = state.events.filter((event) => event.type === 'entityDamage');
    expect(hits.filter((event) => event.targetEntityId === target.id)).toHaveLength(1);
    expect(neighbor.health.current).toBeLessThan(100);
  });
  it('uses intact cover for terrain hits before removing it with a single replayable crater', () => {
    const { state, config, target } = scene();
    target.position = { x: 10.5, y: 10 };
    target.hitbox.radiusMeters = 0.8;
    for (let row = 0; row < state.terrain.rows; row++) state.terrain.setSolid(36, row, true);
    const replay = new TerrainGrid(160, 120, 0.25, state.terrain.cells);
    stepSimulation(state, config, 1 / 60);
    expect(state.lastImpact?.result).toBe('stop');
    expect(state.lastImpact?.craterRadiusMeters).toBe(2.8);
    const resolved = state.events.find((event) => event.type === 'explosionResolved')!;
    const candidate = resolved.resolution.affectedEntities.find(
      (entry) => entry.entityId === target.id,
    )!;
    expect(candidate).toMatchObject({ rawDamage: 60, occluded: true, finalDamage: 15 });
    expect(target.health.current).toBe(85);
    expect(
      isBlastPathOccluded(
        resolved.resolution.explosion.position,
        candidate.targetPosition,
        state.terrain,
      ),
    ).toBe(false);
    const terrainEvents = state.events.filter((event) => event.type === 'terrainDamage');
    expect(terrainEvents).toHaveLength(1);
    for (const damage of terrainEvents) applyTerrainDamage(replay, damage);
    expect(replay.cells).toEqual(state.terrain.cells);
  });
  it.each(['basicCannon', 'heavyPenetrator'] as const)(
    '%s retains non-explosive direct hits',
    (weaponId) => {
      const { state, config } = scene(weaponId);
      stepSimulation(state, config, 1 / 60);
      expect(state.events.map((event) => event.type)).toEqual(['entityImpact', 'entityDamage']);
    },
  );
  it('uses data-driven explosive overrides on any weapon at the next impact', () => {
    const { state, config } = scene('basicCannon');
    // The projectile has already been created; impact settings still take effect now.
    config.weaponOverrides.basicCannon = { explosion: { enabled: true, maxDamage: 20 } };
    state.cannon.weaponId = 'heavyPenetrator';
    stepSimulation(state, config, 1 / 60);
    expect(state.events.find((event) => event.type === 'explosion')?.maxDamage).toBe(20);
  });
  it('can disable mortar explosions after launch', () => {
    const { state, config } = scene();
    config.weaponOverrides.mortar = { explosion: { enabled: false } };
    stepSimulation(state, config, 1 / 60);
    expect(state.events.map((event) => event.type)).toEqual(['entityImpact', 'entityDamage']);
  });
  it('keeps explosion feedback outside snapshots and produces one popup per damage event', () => {
    const { state, config } = scene();
    const runtime = new GameRuntime(config);
    Object.assign(runtime.getState(), state);
    runtime.setPaused(true);
    runtime.step();
    const damage = runtime.getState().events.filter((event) => event.type === 'entityDamage');
    expect(runtime.getDamagePopups().map((popup) => popup.damage)).toEqual(
      damage.map((event) => event.damage),
    );
    expect(runtime.getDamagePopups()).toHaveLength(3);
    expect(runtime.getDamagePopups()[2]?.origin).toEqual({ x: 12, y: 11 });
    expect(runtime.getLastExplosion()?.entitiesDamaged).toBe(2);
    expect(runtime.getLastExplosion()?.maxDealt).toBe(60);
    expect(createGameSnapshot(runtime.getState())).not.toHaveProperty('lastExplosion');
    runtime.step();
    expect(runtime.getState().events).toEqual([]);
    expect(runtime.getLastExplosion()).not.toBeNull();
    runtime.reset();
    expect(runtime.getLastExplosion()).toBeNull();
    expect(runtime.getDamagePopups()).toEqual([]);
  });
  it('processes multiple explosions in projectile order with deterministic health and terrain', () => {
    const run = () => {
      const { state, config, shell } = scene();
      state.projectiles.push({
        ...shell,
        id: state.nextEntityId++,
        position: { ...shell.position },
        previousPosition: { ...shell.previousPosition },
        velocity: { ...shell.velocity },
      });
      stepSimulation(state, config, 1 / 60);
      return state;
    };
    const first = run();
    const explosions = first.events.filter((event) => event.type === 'explosion');
    expect(explosions.map((event) => event.sourceProjectileId)).toEqual([10, 11]);
    expect(createGameSnapshot(run())).toEqual(createGameSnapshot(first));
    expect(run().events).toEqual(first.events);
  });
  it('retains all explosion visuals across catch-up ticks, freezes on pause and clears on reset', () => {
    const { state, config, shell } = scene();
    state.projectiles.push({
      ...shell,
      id: state.nextEntityId++,
      position: { ...shell.position },
      previousPosition: { ...shell.previousPosition },
      velocity: { ...shell.velocity },
    });
    const runtime = new GameRuntime(config);
    Object.assign(runtime.getState(), state);
    runtime.advance(100);
    expect(runtime.getState().events).toEqual([]);
    expect(
      runtime
        .getRecentExplosions()
        .map((item) => item.event.resolution.explosion.sourceProjectileId),
    ).toEqual([10, 11]);
    expect(createGameSnapshot(runtime.getState())).not.toHaveProperty('recentExplosions');
    const captured = runtime.getRecentExplosions();
    const time = runtime.presentationTimeSeconds;
    runtime.setPaused(true);
    runtime.advance(2000);
    expect(runtime.presentationTimeSeconds).toBe(time);
    expect(runtime.getRecentExplosions()).toBe(captured);
    runtime.step();
    expect(runtime.presentationTimeSeconds).toBeGreaterThan(time);
    runtime.setPaused(false);
    for (let frame = 0; frame < 70; frame++) runtime.advance(100);
    expect(runtime.getRecentExplosions()).toEqual([]);
    runtime.reset();
    const next = scene();
    Object.assign(runtime.getState(), next.state);
    runtime.advance(100);
    expect(runtime.getRecentExplosions()).toHaveLength(1);
    runtime.reset();
    expect(runtime.getRecentExplosions()).toEqual([]);
  });
  it('preview stops at the explosive contact without resolving damage or mutating the world', () => {
    const { state, config } = scene();
    state.cannon.position = { x: 5, y: 10 };
    state.cannon.angleRad = 0;
    state.projectiles = [];
    const before = createGameSnapshot(state);
    const preview = simulateTrajectoryPreview(state.cannon, state.terrain, config, state.units);
    expect(preview.impact).not.toBeNull();
    expect(preview.ricochets).toBeUndefined();
    expect(createGameSnapshot(state)).toEqual(before);
    expect(state.events).toEqual([]);
  });
});
