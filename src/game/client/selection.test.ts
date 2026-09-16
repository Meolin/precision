import { describe, expect, it } from 'vitest';
import { GameRuntime } from '../core/GameRuntime';
import { createGameSnapshot } from '../core/GameSnapshot';
import { cloneUnit } from '../entities/UnitState';
import { fitWorld, worldToScreen } from '../rendering/viewport';
import { RtsController } from './RtsController';
import { boxSelection, clickSelection } from './SelectionState';

describe('client selection and control groups', () => {
  it('selects friendly IDs, toggles Shift and refuses enemies independently of hover', () => {
    const runtime = new GameRuntime();
    const controls = new RtsController(runtime);
    const [friendly, enemy, second] = runtime.getState().units;
    const before = createGameSnapshot(runtime.getState());
    controls.setSelection(clickSelection(controls.selection, friendly, 1, false));
    expect(controls.selection.selectedEntityIds).toEqual([1]);
    controls.setSelection(clickSelection(controls.selection, second, 1, true));
    expect(controls.selection.selectedEntityIds).toEqual([1, 3]);
    controls.setSelection(clickSelection(controls.selection, friendly, 1, true));
    expect(controls.selection.selectedEntityIds).toEqual([3]);
    controls.selection.hoveredEntityId = enemy!.id;
    controls.setSelection(clickSelection(controls.selection, enemy, 1, true));
    expect(controls.selection.selectedEntityIds).toEqual([3]);
    expect(controls.selection.hoveredEntityId).toBe(2);
    controls.setSelection(clickSelection(controls.selection, undefined, 1, false));
    expect(controls.selection.selectedEntityIds).toEqual([]);
    expect(createGameSnapshot(runtime.getState())).toEqual(before);
  });

  it('box-selects in screen space in either drag direction, including letterbox offsets', () => {
    const runtime = new GameRuntime();
    const units = runtime.getState().units.slice(0, 3).map(cloneUnit);
    units[0]!.position = { x: 10, y: 10 };
    units[1]!.position = { x: 11, y: 10 };
    units[2]!.position = { x: 50, y: 10 };
    const viewport = fitWorld(600, 600, runtime.getConfig().world);
    const project = (point: { x: number; y: number }) => worldToScreen(point, viewport);
    const start = project({ x: 5, y: 5 });
    const current = project({ x: 15, y: 15 });
    expect(boxSelection({ start, current }, units, 1, project)).toEqual([1]);
    expect(boxSelection({ start: current, current: start }, units, 1, project)).toEqual([1]);
  });

  it('saves independent groups, filters dead/missing/foreign IDs and resets client state', () => {
    const runtime = new GameRuntime();
    const controls = new RtsController(runtime);
    controls.setSelection([1, 3, 5]);
    controls.saveGroup(1);
    controls.setSelection([7]);
    runtime.getState().units.find((unit) => unit.id === 3)!.alive = false;
    controls.controlGroups[1]!.push(2, 999);
    controls.recallGroup(1);
    expect(controls.selection.selectedEntityIds).toEqual([1, 5]);
    runtime.getState().cannon.health.current = 0;
    controls.sync();
    expect(controls.selection.selectedEntityIds).toEqual([5]);
    controls.startTargeting(true);
    runtime.reset();
    controls.sync();
    expect(controls.controlGroups).toEqual({});
    expect(controls.selection.selectedEntityIds).toEqual([1]);
    expect(controls.inputMode).toBe('default');
  });

  it('converts targets to copied serializable commands and allows only single manual fire', () => {
    const runtime = new GameRuntime();
    runtime.setPaused(true);
    const controls = new RtsController(runtime);
    controls.setSelection([1, 3]);
    controls.manualFire();
    expect(runtime.pendingCommands).toBe(0);
    controls.attackGround({ x: 55, y: 60 }, true);
    expect(runtime.pendingCommands).toBe(1);
    expect(controls.lastTarget?.position.y).toBe(runtime.getState().terrain.findSurfaceY(55));
    controls.cancelTargeting();
    expect(controls.inputMode).toBe('default');
    controls.setSelection([3]);
    controls.manualFire();
    expect(runtime.pendingCommands).toBe(3);
  });
});
