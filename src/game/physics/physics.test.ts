import { describe, expect, it } from 'vitest';
import { TerrainGrid } from '../terrain/TerrainGrid';
import { TerrainMaterialId } from '../terrain/TerrainMaterialId';
import { cloneConfig } from '../config/defaultGameConfig';
import { createGameState } from '../core/GameState';
import { createGameSnapshot } from '../core/GameSnapshot';
import { stepSimulation } from '../core/stepSimulation';
import type { BodyState } from './Body';
import { stepBodies, wakeBodiesNearTerrainChange } from './stepBodies';

function circle(id: number, x: number, y: number, vx = 0, vy = 0): BodyState {
  return {
    id,
    kind: 'dynamic',
    shape: { type: 'circle', radius: 0.5 },
    massKg: 1,
    position: { x, y },
    previousPosition: { x, y },
    velocity: { x: vx, y: vy },
    rotationRad: 0,
    previousRotationRad: 0,
    angularVelocityRadPerSecond: 0,
    friction: 0.7,
    restitution: 0.1,
    sleeping: false,
    sleepSeconds: 0,
    color: 0xffffff,
  };
}

function floor(): TerrainGrid {
  const terrain = new TerrainGrid(40, 40, 0.5);
  const changes = [];
  for (let row = 20; row < 40; row++)
    for (let column = 0; column < 40; column++)
      changes.push({ column, row, material: TerrainMaterialId.Soil });
  terrain.applyMaterialChanges(changes);
  return terrain;
}

describe('dynamic bodies', () => {
  it('advances the six samples inside the simulation tick and snapshots them independently', () => {
    const config = cloneConfig();
    const state = createGameState(config, 123);
    expect(state.bodies.map((body) => body.shape.type)).toEqual([
      'circle',
      'circle',
      'circle',
      'box',
      'box',
      'box',
    ]);
    const before = state.bodies[0]!.position.y;
    stepSimulation(state, config, 1 / 60);
    expect(state.bodies[0]!.position.y).toBeGreaterThan(before);
    const snapshot = createGameSnapshot(state);
    expect(JSON.parse(JSON.stringify(snapshot)).bodies).toHaveLength(6);
    snapshot.bodies[0]!.position.y = -100;
    expect(state.bodies[0]!.position.y).toBeGreaterThan(before);
  });

  it('sweeps a fast circle into thin CPU terrain instead of tunneling through it', () => {
    const terrain = new TerrainGrid(40, 40, 0.5);
    terrain.setSolid(10, 20, true);
    const body = circle(1, 5.25, 1, 0, 150);
    stepBodies([body], terrain, 0, 0.1);
    expect(body.position.y).toBeLessThan(10);
    expect(body.velocity.y).toBeLessThanOrEqual(0);
  });

  it('settles on terrain, sleeps, and wakes after support changes', () => {
    const terrain = floor();
    const body = circle(1, 5, 6);
    for (let tick = 0; tick < 300; tick++) stepBodies([body], terrain, 9.81, 1 / 60);
    expect(body.position.y).toBeCloseTo(9.5, 1);
    expect(body.sleeping).toBe(true);
    terrain.destroyCircle({ x: 5, y: 10 }, 2);
    wakeBodiesNearTerrainChange([body], terrain.lastChange.dirtyRect!, terrain.cellSizeMeters);
    expect(body.sleeping).toBe(false);
    stepBodies([body], terrain, 9.81, 1 / 60);
    expect(body.position.y).toBeGreaterThan(9.5);
  });

  it('resolves body impulses in ID order regardless of array order', () => {
    const terrain = new TerrainGrid(40, 40, 0.5);
    const run = (reverse: boolean) => {
      const a = circle(1, 4, 4, 10);
      const b = circle(2, 5.5, 4);
      a.restitution = b.restitution = 1;
      const bodies = reverse ? [b, a] : [a, b];
      stepBodies(bodies, terrain, 0, 0.1);
      return [a.position, a.velocity, b.position, b.velocity] as const;
    };
    expect(run(true)).toEqual(run(false));
    const [, aVelocity, , bVelocity] = run(false);
    expect(aVelocity.x).toBeLessThan(10);
    expect(bVelocity.x).toBeGreaterThan(0);
  });

  it('collides an axis-aligned box with the occupied surface', () => {
    const terrain = floor();
    const body: BodyState = {
      ...circle(1, 5, 7),
      shape: { type: 'box', halfWidth: 0.6, halfHeight: 0.8 },
    };
    for (let tick = 0; tick < 150; tick++) stepBodies([body], terrain, 9.81, 1 / 60);
    expect(body.position.y).toBeCloseTo(9.2, 1);
  });

  it('applies restitution and friction at a terrain impact', () => {
    const terrain = floor();
    const body = circle(1, 5, 8.6, 4, 10);
    body.restitution = 0.8;
    body.friction = 1;
    stepBodies([body], terrain, 0, 0.1);
    expect(body.velocity.y).toBeLessThan(0);
    expect(body.velocity.x).toBeLessThan(4);
  });

  it('keeps static and kinematic bodies free of gravity', () => {
    const terrain = new TerrainGrid(40, 40, 0.5);
    const fixed = { ...circle(1, 2, 2), kind: 'static' as const };
    const driven = { ...circle(2, 4, 2, 3), kind: 'kinematic' as const };
    stepBodies([fixed, driven], terrain, 9.81, 0.1);
    expect(fixed.position).toEqual({ x: 2, y: 2 });
    expect(driven.position.x).toBeCloseTo(4.3);
    expect(driven.position.y).toBe(2);
  });
});
