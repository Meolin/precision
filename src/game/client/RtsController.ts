import type { GameRuntime } from '../core/GameRuntime';
import { isControllable, isInstallation } from '../entities/InstallationState';
import type { PlayerId } from '../entities/UnitState';
import type { EntityId, Vec2 } from '../math/Vec2';
import type { WeaponId } from '../weapons/WeaponDefinition';
import {
  filterControllableIds,
  type ControlGroups,
  type SelectionRectangle,
  type SelectionState,
} from './SelectionState';
import { CameraController } from './CameraController';

export type InputMode = 'default' | 'attackGround';

/** Client-only state. Nothing here is included in GameState or replay snapshots. */
export class RtsController {
  readonly camera: CameraController;
  readonly selection: SelectionState = { selectedEntityIds: [] };
  controlGroups: ControlGroups = {};
  inputMode: InputMode = 'default';
  queueTargeting = false;
  rectangle: SelectionRectangle | null = null;
  lastTarget: { position: Vec2; entityId?: EntityId } | null = null;
  inspectedEntityId: EntityId | null = null;
  private stateIdentity;

  constructor(
    readonly runtime: GameRuntime,
    readonly playerId: PlayerId = 1,
  ) {
    this.stateIdentity = runtime.getState();
    const first = this.stateIdentity.units.find((unit) => isControllable(unit, playerId));
    this.selection.selectedEntityIds = first ? [first.id] : [];
    this.camera = new CameraController(runtime.getConfig().world, this.cameraFocus());
  }

  private cameraFocus(): Vec2 | undefined {
    const units = this.runtime
      .getState()
      .units.filter((unit) => isControllable(unit, this.playerId));
    if (!units.length) return undefined;
    return {
      x: units.reduce((sum, unit) => sum + unit.position.x, 0) / units.length,
      y: units.reduce((sum, unit) => sum + unit.position.y, 0) / units.length,
    };
  }

  sync(): void {
    const state = this.runtime.getState();
    if (state !== this.stateIdentity) {
      this.stateIdentity = state;
      this.controlGroups = {};
      this.cancelTargeting();
      this.rectangle = null;
      this.lastTarget = null;
      this.inspectedEntityId = null;
      this.selection.hoveredEntityId = undefined;
      const first = state.units.find((unit) => isControllable(unit, this.playerId));
      this.selection.selectedEntityIds = first ? [first.id] : [];
      this.camera.reset(this.runtime.getConfig().world, this.cameraFocus());
    }
    this.selection.selectedEntityIds = filterControllableIds(
      this.selection.selectedEntityIds,
      state.units,
      this.playerId,
    );
    for (const key of Object.keys(this.controlGroups)) {
      const group = Number(key);
      this.controlGroups[group] = filterControllableIds(
        this.controlGroups[group] ?? [],
        state.units,
        this.playerId,
      );
    }
    if (
      !state.units.some(
        (unit) =>
          unit.id === this.selection.hoveredEntityId && unit.alive && unit.health.current > 0,
      )
    )
      this.selection.hoveredEntityId = undefined;
    if (!this.selection.selectedEntityIds.length) this.cancelTargeting();
  }

  getSelectedInstallations() {
    this.sync();
    return this.runtime
      .getState()
      .units.filter(isInstallation)
      .filter((unit) => this.selection.selectedEntityIds.includes(unit.id))
      .sort((a, b) => a.id - b.id);
  }

  getSingleInstallation() {
    const selected = this.getSelectedInstallations();
    return this.selection.selectedEntityIds.length === 1 && selected.length === 1
      ? (selected[0] ?? null)
      : null;
  }

  setSelection(ids: EntityId[]): void {
    this.sync();
    this.selection.selectedEntityIds = filterControllableIds(
      ids,
      this.runtime.getState().units,
      this.playerId,
    );
    this.cancelTargeting();
  }

  saveGroup(group: number): void {
    this.sync();
    if (Number.isInteger(group) && group >= 1 && group <= 9)
      this.controlGroups[group] = [...this.selection.selectedEntityIds];
  }

  recallGroup(group: number): void {
    this.sync();
    this.setSelection([...(this.controlGroups[group] ?? [])]);
  }

  startTargeting(queue = false): void {
    if (!this.getSelectedInstallations().length) return;
    this.inputMode = 'attackGround';
    this.queueTargeting = queue;
    this.rectangle = null;
  }

  cancelTargeting(): void {
    this.inputMode = 'default';
    this.queueTargeting = false;
  }

  attackGround(position: Vec2, queue = false): void {
    const entityIds = this.getSelectedInstallations().map((unit) => unit.id);
    if (!entityIds.length) return;
    // Clicking inside terrain targets its surface, rather than an unreachable buried point.
    const terrain = this.runtime.getState().terrain;
    const surfaceY = terrain.findSurfaceY(position.x);
    const targetPosition = {
      x: position.x,
      y: surfaceY !== null && position.y >= surfaceY ? surfaceY : position.y,
    };
    const append = queue || this.queueTargeting;
    this.runtime.enqueueCommand({
      type: 'attackGround',
      playerId: this.playerId,
      entityIds,
      targetPosition,
      queue: append,
    });
    this.lastTarget = { position: { ...targetPosition } };
    this.cancelTargeting();
    if (append) this.startTargeting(true);
  }

  attackTarget(targetEntityId: EntityId, queue = false): void {
    const entityIds = this.getSelectedInstallations().map((unit) => unit.id);
    const target = this.runtime
      .getState()
      .units.find((unit) => unit.id === targetEntityId && unit.alive);
    if (!entityIds.length || !target || target.ownerPlayerId === this.playerId) return;
    this.runtime.enqueueCommand({
      type: 'attackTarget',
      playerId: this.playerId,
      entityIds,
      targetEntityId,
      queue,
    });
    this.lastTarget = { position: { ...target.position }, entityId: target.id };
    this.cancelTargeting();
  }

  stop(queue = false): void {
    const entityIds = this.getSelectedInstallations().map((unit) => unit.id);
    if (entityIds.length)
      this.runtime.enqueueCommand({ type: 'stop', playerId: this.playerId, entityIds, queue });
    this.cancelTargeting();
    this.lastTarget = null;
  }

  setWeapon(weaponId: WeaponId): void {
    const entityIds = this.getSelectedInstallations().map((unit) => unit.id);
    if (entityIds.length)
      this.runtime.enqueueCommand({
        type: 'setWeapon',
        playerId: this.playerId,
        entityIds,
        weaponId,
      });
  }

  manualAim(angleRad: number): void {
    const unit = this.getSingleInstallation();
    if (!unit || unit.orders.length || this.inputMode !== 'default') return;
    this.runtime.enqueueCommand({
      type: 'setAim',
      playerId: this.playerId,
      cannonId: unit.id,
      angleRad,
    });
  }

  manualFire(): void {
    const unit = this.getSingleInstallation();
    if (!unit) return;
    this.cancelTargeting();
    this.runtime.enqueueCommand({ type: 'stop', playerId: this.playerId, entityIds: [unit.id] });
    const cursor = this.runtime.getCursorPosition();
    if (cursor)
      this.runtime.enqueueCommand({
        type: 'setAim',
        playerId: this.playerId,
        cannonId: unit.id,
        angleRad: Math.atan2(unit.position.y - cursor.y, cursor.x - unit.position.x),
      });
    this.runtime.enqueueCommand({ type: 'fire', playerId: this.playerId, cannonId: unit.id });
  }
}
