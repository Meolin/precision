import { describe, expect, it } from 'vitest';
import { executeCommand } from '../commands/executeCommand';
import type { AttackGroundCommand } from '../commands/GameCommand';
import { cloneConfig } from '../config/defaultGameConfig';
import { createGameState } from '../core/GameState';
import { createGameSnapshot } from '../core/GameSnapshot';
import { GameRuntime } from '../core/GameRuntime';
import { stepSimulation } from '../core/stepSimulation';
import { isInstallation } from '../entities/InstallationState';
import { refreshUnitGrounding } from '../movement/terrainGrounding';
import { TerrainGrid } from '../terrain/TerrainGrid';

function scene() {
  const config = cloneConfig();
  config.rts.installationsPerPlayer = 1;
  const state = createGameState(config, 12345);
  state.terrain = new TerrainGrid(600, 320, 0.2);
  for (let column = 0; column < 600; column++)
    for (let row = 200; row < 320; row++) state.terrain.setSolid(column, row, true);
  state.cannon.position.x = 10;
  state.units[1]!.position.x = 55;
  for (const unit of state.units.filter(isInstallation)) {
    unit.grounding.terrainVersion = -1;
    refreshUnitGrounding(unit, state.terrain);
  }
  const attack: AttackGroundCommand = {
    type: 'attackGround',
    playerId: 1,
    entityIds: [1],
    targetPosition: { x: 45, y: 40 },
    queue: false,
  };
  return { config, state, attack };
}

describe('installation command boundary and queues', () => {
  it('supports ten installations and fifty same-tick projectile spawns without ID reuse', () => {
    const config = cloneConfig();
    config.rts.installationsPerPlayer = 5;
    const state = createGameState(config, 12345);
    for (const unit of state.units.filter(isInstallation)) {
      executeCommand(state, config, {
        type: 'setWeapon',
        playerId: unit.ownerPlayerId,
        entityIds: [unit.id],
        weaponId: 'basicCannon',
      });
      for (let shot = 0; shot < 5; shot++)
        executeCommand(state, config, {
          type: 'fire',
          playerId: unit.ownerPlayerId,
          cannonId: unit.id,
        });
    }
    expect(state.units).toHaveLength(10);
    expect(state.projectiles).toHaveLength(50);
    expect(new Set(state.projectiles.map((projectile) => projectile.id)).size).toBe(50);
    stepSimulation(state, config, 1 / 60);
    expect(state.shotsFired).toBe(50);
    expect(
      state.projectiles.every(
        (projectile) =>
          Number.isFinite(projectile.position.x) && Number.isFinite(projectile.position.y),
      ),
    ).toBe(true);
  });

  it('validates ownership, life, weapon capability and finite ground targets in simulation', () => {
    const { state, config, attack } = scene();
    executeCommand(state, config, { ...attack, entityIds: [2, 999], playerId: 1 });
    executeCommand(state, config, { ...attack, playerId: 2 });
    executeCommand(state, config, { ...attack, targetPosition: { x: NaN, y: 1 } });
    expect(state.units.filter(isInstallation).every((unit) => unit.orders.length === 0)).toBe(true);
    state.cannon.availableWeaponIds = ['basicCannon'];
    executeCommand(state, config, {
      type: 'setWeapon',
      playerId: 1,
      entityIds: [1, 2],
      weaponId: 'mortar',
    });
    expect(state.units.filter(isInstallation).map((unit) => unit.weaponId)).toEqual([
      'basicCannon',
      'basicCannon',
    ]);
    state.cannon.alive = false;
    executeCommand(state, config, attack);
    expect(state.cannon.orders).toEqual([]);
  });

  it('appends with Shift, replaces without Shift, copies data and bounds the queue', () => {
    const { state, config, attack } = scene();
    executeCommand(state, config, attack);
    attack.targetPosition.x = 46;
    expect(state.cannon.orders[0]).toEqual({
      type: 'attackGround',
      targetPosition: { x: 45, y: 40 },
    });
    executeCommand(state, config, { ...attack, queue: true });
    expect(state.cannon.orders).toHaveLength(2);
    executeCommand(state, config, attack);
    expect(state.cannon.orders).toHaveLength(1);
    for (let i = 0; i < 40; i++) executeCommand(state, config, { ...attack, queue: true });
    expect(state.cannon.orders).toHaveLength(config.rts.maxOrders);
    expect(JSON.parse(JSON.stringify(attack))).toEqual(attack);
    const snapshot = createGameSnapshot(state);
    const first = snapshot.cannon.orders[0]!;
    if (first.type === 'attackGround') first.targetPosition.x = -100;
    snapshot.cannon.availableWeaponIds.length = 0;
    expect(state.cannon.orders[0]).not.toEqual(first);
    expect(state.cannon.availableWeaponIds.length).toBeGreaterThan(0);
  });

  it('validates target IDs and advances past destroyed targets even during reload', () => {
    const { state, config, attack } = scene();
    for (const targetEntityId of [1, 999])
      executeCommand(state, config, {
        type: 'attackTarget',
        playerId: 1,
        entityIds: [1],
        targetEntityId,
        queue: false,
      });
    expect(state.cannon.orders).toEqual([]);
    executeCommand(state, config, {
      type: 'attackTarget',
      playerId: 1,
      entityIds: [1],
      targetEntityId: 2,
      queue: false,
    });
    executeCommand(state, config, { ...attack, queue: true });
    state.cannon.nextFireTimeSeconds = 10;
    state.units[1]!.alive = false;
    stepSimulation(state, config, 1 / 60);
    expect(state.cannon.orders).toEqual([
      { type: 'attackGround', targetPosition: attack.targetPosition },
    ]);
    expect(state.cannon.fireControl.lastFailure).toBe('targetLost');
    expect(state.shotsFired).toBe(0);
  });

  it('Stop clears the queue, Shift+Stop removes only the current order and preserves cooldown', () => {
    const { state, config, attack } = scene();
    executeCommand(state, config, attack);
    executeCommand(state, config, { ...attack, queue: true });
    state.cannon.nextFireTimeSeconds = 10;
    executeCommand(state, config, { type: 'stop', playerId: 1, entityIds: [1], queue: true });
    expect(state.cannon.orders).toHaveLength(1);
    executeCommand(state, config, { type: 'stop', playerId: 1, entityIds: [1] });
    expect(state.cannon.orders).toEqual([]);
    expect(state.cannon.nextFireTimeSeconds).toBe(10);
  });

  it('fires one shot per order and respects the same cooldown after manual fire or weapon switch', () => {
    const { state, config, attack } = scene();
    state.cannon.weaponId = 'mortar';
    stepSimulation(state, config, 1 / 60, [attack, { ...attack, queue: true }]);
    expect(state.shotsFired).toBe(1);
    expect(state.cannon.orders).toHaveLength(1);
    stepSimulation(state, config, 1 / 60);
    expect(state.shotsFired).toBe(1);
    executeCommand(state, config, {
      type: 'setWeapon',
      playerId: 1,
      entityIds: [1],
      weaponId: 'basicCannon',
    });
    executeCommand(state, config, { type: 'fire', playerId: 1, cannonId: 1 });
    expect(state.shotsFired).toBe(1);
    expect(state.cannon.orders).toEqual([]);
    state.elapsedSeconds = state.cannon.nextFireTimeSeconds;
    stepSimulation(state, config, 1 / 60, [attack]);
    expect(state.shotsFired).toBe(2);
  });

  it('fails unreachable targets once and advances the queue without spawning invalid projectiles', () => {
    const { state, config, attack } = scene();
    config.physics.gravity = 40;
    const unreachable = { ...attack, targetPosition: { x: 119, y: 0 } };
    stepSimulation(state, config, 1 / 60, [unreachable, { ...unreachable, queue: true }]);
    expect(state.shotsFired).toBe(0);
    expect(state.cannon.orders).toHaveLength(1);
    expect(state.cannon.fireControl.lastFailure).toBe('noBallisticSolution');
    stepSimulation(state, config, 1 / 60);
    expect(state.cannon.orders).toEqual([]);
    expect(state.projectiles).toEqual([]);
  });

  it('launches group shots in ID order and copies pending command payloads while paused', () => {
    const { state, config, attack } = scene();
    const second = structuredClone(state.cannon);
    second.id = 3;
    second.position.x = 18;
    second.grounding.terrainVersion = -1;
    refreshUnitGrounding(second, state.terrain);
    state.units.push(second);
    state.nextEntityId = 4;
    stepSimulation(state, config, 1 / 60, [{ ...attack, entityIds: [3, 1, 3] }]);
    expect(
      state.events
        .filter((event) => event.type === 'projectileSpawned')
        .map((event) => event.projectile.ownerEntityId),
    ).toEqual([1, 3]);
    expect(state.projectiles).toHaveLength(2);
    const runtime = new GameRuntime(config);
    runtime.setPaused(true);
    const pending = { ...attack, entityIds: [1], targetPosition: { x: 45, y: 40 } };
    runtime.enqueueCommand(pending);
    pending.entityIds.length = 0;
    pending.targetPosition.x = NaN;
    runtime.step();
    expect(runtime.pendingCommands).toBe(0);
    expect(runtime.getState().cannon.fireControl.status).not.toBe('idle');
  });

  it('executes an AttackTarget order as a real hit through the existing damage pipeline', () => {
    const { state, config } = scene();
    stepSimulation(state, config, 1 / 60, [
      { type: 'attackTarget', playerId: 1, entityIds: [1], targetEntityId: 2, queue: false },
    ]);
    expect(state.shotsFired).toBe(1);
    expect(state.cannon.orders).toEqual([]);
    for (let tick = 0; tick < 1200 && state.projectiles.length; tick++)
      stepSimulation(state, config, 1 / 60);
    expect(state.lastEntityImpact?.targetEntityId).toBe(2);
    expect(state.units[1]!.health.current).toBeLessThan(100);
  });
});
