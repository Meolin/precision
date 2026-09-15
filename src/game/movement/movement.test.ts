import { describe, expect, it } from 'vitest';
import { createProjectile } from '../ballistics/Projectile';
import { executeCommand } from '../commands/executeCommand';
import { cloneConfig, validateConfig } from '../config/defaultGameConfig';
import { GameRuntime } from '../core/GameRuntime';
import { createGameState } from '../core/GameState';
import { createGameSnapshot } from '../core/GameSnapshot';
import { stepSimulation } from '../core/stepSimulation';
import { hitboxCenter } from '../entities/Hitbox';
import { circleTouchesTerrain } from '../terrain/terrainCollision';
import { TerrainGrid } from '../terrain/TerrainGrid';
import { createMovementState } from './UnitMovementState';
import { queryUnitGrounding, refreshUnitGrounding } from './terrainGrounding';
import { updateUnitMovement } from './updateUnitMovement';
import { simulateTrajectoryPreview } from '../ballistics/trajectoryPreview';
import { toRadians } from '../math/Vec2';

function scene(height: (x: number) => number = () => 15) {
  const config = cloneConfig();
  config.physics.gravity = 0;
  const state = createGameState(config, 12345);
  state.terrain = new TerrainGrid(160, 100, 0.2);
  for (let col = 0; col < state.terrain.columns; col++) {
    const surface = height((col + 0.5) * state.terrain.cellSizeMeters);
    for (
      let row = Math.round(surface / state.terrain.cellSizeMeters);
      row < state.terrain.rows;
      row++
    )
      state.terrain.setSolid(col, row, true);
  }
  state.cannon.position = { x: 5, y: 0 };
  state.cannon.movement = createMovementState(config.movement.speedMetersPerSecond);
  state.units[1]!.position = { x: 25, y: 0 };
  state.units[1]!.movement = createMovementState(0);
  for (const unit of state.units) refreshUnitGrounding(unit, state.terrain);
  return { config, state, unit: state.cannon };
}

describe('terrain-surface movement', () => {
  it('moves at meters per second on flat terrain and stops exactly without oscillation', () => {
    const { config, state, unit } = scene();
    executeCommand(state, config, { type: 'moveUnit', unitId: unit.id, targetX: 10 });
    for (let i = 0; i < 30; i++) updateUnitMovement(unit, state.terrain, config.movement, 1 / 60);
    expect(unit.position.x).toBeCloseTo(7);
    expect(unit.position.y).toBeCloseTo(13.9, 4);
    for (let i = 0; i < 100; i++) updateUnitMovement(unit, state.terrain, config.movement, 1 / 60);
    expect(unit.position.x).toBe(10);
    expect(unit.movement?.targetX).toBeNull();
    expect(unit.movement?.grounded).toBe(true);
    expect(
      circleTouchesTerrain(
        state.terrain,
        hitboxCenter(unit.position, unit.hitbox),
        unit.hitbox.radiusMeters,
      ),
    ).toBe(false);
  });
  it('follows a gentle hill, including grid stairs, in both directions', () => {
    const { config, state, unit } = scene((x) => 17 - x * 0.2);
    const initialY = unit.position.y;
    executeCommand(state, config, { type: 'moveUnit', unitId: unit.id, targetX: 10 });
    for (let i = 0; i < 150; i++) updateUnitMovement(unit, state.terrain, config.movement, 1 / 60);
    expect(unit.position.x).toBe(10);
    expect(unit.position.y).toBeLessThan(initialY - 0.5);
    expect(unit.movement?.blockedReason).toBeNull();
    executeCommand(state, config, { type: 'moveUnit', unitId: unit.id, targetX: 5 });
    for (let i = 0; i < 150; i++) updateUnitMovement(unit, state.terrain, config.movement, 1 / 60);
    expect(unit.position.x).toBe(5);
    expect(unit.position.y).toBeCloseTo(initialY);
  });
  it.each([1 / 240, 1 / 15, 3])('blocks a steep ledge with dt %s, without skipping it', (dt) => {
    const { config, state, unit } = scene((x) => (x < 8 ? 15 : 10));
    executeCommand(state, config, { type: 'moveUnit', unitId: unit.id, targetX: 15 });
    for (let i = 0; i < 1000 && unit.movement?.targetX !== null; i++)
      updateUnitMovement(unit, state.terrain, config.movement, dt);
    expect(unit.position.x).toBeLessThan(8);
    expect(unit.movement?.blockedReason).toBe('slope');
    expect(unit.movement?.targetX).toBeNull();
    expect(unit.movement!.slopeAngleDeg).toBeGreaterThan(config.movement.maxSlopeAngleDeg);
  });
  it('rejects unknown, dead, immobile, nonfinite and out-of-bounds commands', () => {
    const { config, state, unit } = scene();
    for (const targetX of [NaN, Infinity, -5, config.world.widthMeters + 1])
      executeCommand(state, config, { type: 'moveUnit', unitId: unit.id, targetX });
    executeCommand(state, config, { type: 'moveUnit', unitId: 999, targetX: 10 });
    executeCommand(state, config, { type: 'moveUnit', unitId: 2, targetX: 10 });
    expect(unit.movement?.targetX).toBeNull();
    expect(state.units[1]!.movement?.targetX).toBeNull();
    unit.alive = false;
    unit.health.current = 0;
    executeCommand(state, config, { type: 'moveUnit', unitId: unit.id, targetX: 10 });
    const position = { ...unit.position };
    unit.movement!.targetX = 10;
    updateUnitMovement(unit, state.terrain, config.movement, 1);
    expect(unit.position).toEqual(position);
  });
  it('re-grounds stationary units after a crater and corrects overlap with cell corners', () => {
    const { config, state, unit } = scene();
    const initialY = unit.position.y;
    state.terrain.removeCircle({ x: unit.position.x, y: 15 }, 3);
    stepSimulation(state, config, 1 / 60);
    expect(unit.position.y).toBeGreaterThan(initialY + 1);
    expect(unit.movement?.grounded).toBe(true);
    expect(circleTouchesTerrain(state.terrain, unit.position, unit.hitbox.radiusMeters)).toBe(
      false,
    );
    state.terrain.setSolid(25, 60, true);
    refreshUnitGrounding(unit, state.terrain);
    expect(circleTouchesTerrain(state.terrain, unit.position, unit.hitbox.radiusMeters)).toBe(
      false,
    );
  });
  it('updates grounding in the same tick as terrain impact without AoE damage', () => {
    const { config, state, unit } = scene();
    const initialY = unit.position.y;
    const shell = createProjectile(unit, config, 3, 0);
    shell.position = { x: unit.position.x + 1.5, y: 12 };
    shell.velocity = { x: 0, y: 40 };
    state.projectiles.push(shell);
    stepSimulation(state, config, 0.2);
    expect(state.lastImpact).not.toBeNull();
    expect(unit.position.y).toBeGreaterThan(initialY);
    expect(unit.health.current).toBe(100);
    expect(unit.movement?.terrainVersion).toBe(state.terrain.version);
  });
  it('handles removed support and keeps finite positions, with no rigid-body gravity', () => {
    const { state, unit } = scene();
    state.terrain.removeCircle({ x: 5, y: 15 }, 12);
    refreshUnitGrounding(unit, state.terrain);
    expect(unit.movement?.grounded).toBe(false);
    expect(unit.movement?.targetX).toBeNull();
    expect(unit.movement?.blockedReason).toBe('noGround');
    expect(Number.isFinite(unit.position.y)).toBe(true);
  });
  it('accounts for hitbox offsets while grounding', () => {
    const { state, unit } = scene();
    unit.hitbox.offset = { x: 0.5, y: -0.5 };
    const grounding = queryUnitGrounding(state.terrain, unit, 5);
    expect(grounding.position.y).toBeCloseTo(14.4, 4);
    expect(
      circleTouchesTerrain(
        state.terrain,
        hitboxCenter(grounding.position, unit.hitbox),
        unit.hitbox.radiusMeters,
      ),
    ).toBe(false);
  });
  it('fires and aims after moving, while collision sees the new target position', () => {
    const { config, state, unit } = scene();
    executeCommand(state, config, { type: 'moveUnit', unitId: 1, targetX: 10 });
    stepSimulation(state, config, 2);
    expect(unit.position.x).toBe(10);
    const before = { ...unit.position };
    stepSimulation(state, config, 1 / 60, [
      { type: 'setAim', cannonId: 1, angleRad: 0.2 },
      { type: 'fire', cannonId: 1 },
    ]);
    expect(state.projectiles[0]!.ownerEntityId).toBe(1);
    expect(state.projectiles[0]!.previousPosition.x).toBeCloseTo(
      before.x + Math.cos(0.2) * config.cannon.barrelLengthMeters,
    );
    const target = state.units[1]!;
    target.movement = createMovementState(4);
    refreshUnitGrounding(target, state.terrain);
    const shell = createProjectile(unit, config, 4, state.tick);
    shell.position = { x: 27, y: target.position.y };
    shell.velocity = { x: 0, y: 0 };
    state.projectiles = [shell];
    stepSimulation(state, config, 0.5, [{ type: 'moveUnit', unitId: target.id, targetX: 27 }]);
    expect(target.position.x).toBe(27);
    expect(state.lastEntityImpact?.targetEntityId).toBe(target.id);
  });
  it('preserves move/fire command order, supports firing while moving, and pauses orders', () => {
    const runtime = new GameRuntime();
    runtime.setPaused(true);
    const initialX = runtime.getState().cannon.position.x;
    const preview = runtime.getTrajectoryPreview();
    runtime.enqueueCommand({ type: 'moveUnit', unitId: 1, targetX: initialX + 0.1 });
    runtime.enqueueCommand({ type: 'fire', cannonId: 1 });
    runtime.advance(1000);
    expect(runtime.getState().cannon.position.x).toBe(initialX);
    runtime.step();
    expect(runtime.getState().cannon.position.x).toBeGreaterThan(initialX);
    expect(runtime.getState().shotsFired).toBe(1);
    expect(runtime.getTrajectoryPreview()).not.toBe(preview);
    const snapshot = createGameSnapshot(runtime.getState());
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    snapshot.units[0]!.movement!.targetX = -100;
    expect(runtime.getState().cannon.movement?.targetX).not.toBe(-100);
  });
  it('validates tuning and updates speed without resetting combat state', () => {
    const config = cloneConfig();
    config.movement.maxSlopeAngleDeg = 100;
    config.movement.speedMetersPerSecond = NaN;
    const validated = validateConfig(config);
    expect(validated.movement).toEqual({ speedMetersPerSecond: 4, maxSlopeAngleDeg: 80 });
    const runtime = new GameRuntime();
    config.movement.speedMetersPerSecond = 7;
    runtime.updateConfig(config);
    expect(runtime.getState().cannon.movement?.speedMetersPerSecond).toBe(7);
  });
  it('replays movement and shooting deterministically at different render rates', () => {
    const run = (hz: number) => {
      const runtime = new GameRuntime();
      runtime.enqueueCommand({ type: 'moveUnit', unitId: 1, targetX: 22 });
      runtime.enqueueCommand({ type: 'fire', cannonId: 1 });
      for (let i = 0; i < hz * 3; i++) runtime.advance(1000 / hz);
      return createGameSnapshot(runtime.getState());
    };
    expect(run(30)).toEqual(run(144));
  });
  it('can hit and destroy the default stationary target through normal fire commands', () => {
    const config = cloneConfig();
    const state = createGameState(config, 12345);
    const target = state.units[1]!;
    let angle: number | undefined;
    for (let degrees = 15; degrees <= 75; degrees += 0.25) {
      state.cannon.angleRad = toRadians(degrees);
      const preview = simulateTrajectoryPreview(state.cannon, state.terrain, config, state.units);
      if (
        preview.impact &&
        Math.hypot(preview.impact.x - target.position.x, preview.impact.y - target.position.y) < 1
      ) {
        angle = state.cannon.angleRad;
        break;
      }
    }
    expect(angle).toBeDefined();
    for (let shot = 0; shot < 8 && target.alive; shot++) {
      stepSimulation(state, config, 1 / 60, [
        { type: 'setAim', cannonId: 1, angleRad: angle! },
        { type: 'fire', cannonId: 1 },
      ]);
      for (let tick = 0; tick < 600 && state.projectiles.length; tick++)
        stepSimulation(state, config, 1 / 60);
      expect(state.lastEntityImpact?.targetEntityId).toBe(target.id);
    }
    expect(target.health.current).toBe(0);
    expect(target.alive).toBe(false);
  });
});
