import { useEffect, type RefObject } from 'react';
import type { RtsController } from '../client/RtsController';
import { boxSelection, clickSelection } from '../client/SelectionState';
import type { GameRuntime } from '../core/GameRuntime';
import { hitboxCenter } from '../entities/Hitbox';
import { clamp, toRadians, type Vec2 } from '../math/Vec2';
import {
  isInsideViewport,
  screenToWorld,
  worldToScreen,
  type CameraViewport,
} from '../rendering/viewport';
import {
  containsPoint,
  isInsideMinimapWorld,
  minimapLayout,
  type MinimapLayout,
} from '../rendering/minimapViewport';

interface Drag {
  kind: 'selection' | 'pan' | 'minimap';
  pointerId: number;
  button: number;
  start: Vec2;
  previous: Vec2;
  cameraOffset: Vec2;
  additive: boolean;
  width: number;
  height: number;
  pixelsPerMeter: number;
  state: object;
}

export function useGameInput(
  surface: RefObject<HTMLDivElement | null>,
  runtime: GameRuntime,
  controls: RtsController,
  onPause: () => void,
  onReset: () => void,
  onToggleTerrainDebug: (key: 'collisionMask' | 'terrainChunks' | 'terrainDirtyRects') => void,
): void {
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const camera = controls.camera;
    let drag: Drag | null = null;
    let lastPointer: { clientX: number; clientY: number } | null = null;
    const panKeys = new Set<string>();
    const updateDirection = () =>
      camera.setDirection(
        Number(panKeys.has('ArrowRight')) - Number(panKeys.has('ArrowLeft')),
        Number(panKeys.has('ArrowDown')) - Number(panKeys.has('ArrowUp')),
      );
    const stopPanning = () => {
      panKeys.clear();
      updateDirection();
    };
    const locate = (event: { clientX: number; clientY: number }) => {
      controls.sync();
      const bounds = element.getBoundingClientRect();
      const config = runtime.getConfig();
      const screen = {
        x: ((event.clientX - bounds.left) * element.clientWidth) / Math.max(1, bounds.width),
        y: ((event.clientY - bounds.top) * element.clientHeight) / Math.max(1, bounds.height),
      };
      const viewport = camera.getViewport(element.clientWidth, element.clientHeight);
      const minimap = minimapLayout(element.clientWidth, element.clientHeight, config.world);
      const overMinimap = minimap !== null && containsPoint(minimap.panel, screen);
      if (overMinimap) element.dataset.minimap = 'true';
      else delete element.dataset.minimap;
      const world = screenToWorld(screen, viewport);
      const inside =
        !overMinimap &&
        drag?.kind !== 'minimap' &&
        isInsideViewport(screen, viewport) &&
        world.x >= 0 &&
        world.y >= 0 &&
        world.x < config.world.widthMeters &&
        world.y < config.world.heightMeters;
      const unit = inside
        ? runtime
            .getState()
            .units.filter((candidate) => candidate.alive && candidate.health.current > 0)
            .map((candidate) => {
              const point = worldToScreen(
                hitboxCenter(candidate.position, candidate.hitbox),
                viewport,
              );
              return {
                unit: candidate,
                visible:
                  isInsideViewport(point, viewport) &&
                  (!minimap || !containsPoint(minimap.panel, point)),
                distance: Math.hypot(screen.x - point.x, screen.y - point.y),
              };
            })
            .filter(
              (candidate) =>
                candidate.visible &&
                candidate.distance <=
                  Math.max(10, candidate.unit.hitbox.radiusMeters * viewport.pixelsPerMeter),
            )
            .sort((a, b) => a.distance - b.distance || a.unit.id - b.unit.id)[0]?.unit
        : undefined;
      runtime.setCursorPosition(inside ? world : null);
      controls.selection.hoveredEntityId = unit?.id;
      return { screen, viewport, world, inside, unit, minimap, overMinimap };
    };
    const moveFromMinimap = (screen: Vec2, layout: MinimapLayout, offset: Vec2) => {
      const position = screenToWorld(screen, layout.viewport);
      const viewport = camera.getViewport(element.clientWidth, element.clientHeight);
      const center = {
        x: viewport.worldX + viewport.worldWidth / 2,
        y: viewport.worldY + viewport.worldHeight / 2,
      };
      camera.pan(position.x - offset.x - center.x, position.y - offset.y - center.y);
    };
    const withinFrame = (point: Vec2, viewport: CameraViewport): Vec2 => ({
      x: clamp(point.x, viewport.frameX, viewport.frameX + viewport.width),
      y: clamp(point.y, viewport.frameY, viewport.frameY + viewport.height),
    });
    const cancelDrag = () => {
      const pointerId = drag?.pointerId;
      drag = null;
      controls.rectangle = null;
      delete element.dataset.panning;
      if (pointerId !== undefined && element.hasPointerCapture(pointerId))
        element.releasePointerCapture(pointerId);
    };
    const validDrag = (current: Drag, viewport: CameraViewport) =>
      current.width === element.clientWidth &&
      current.height === element.clientHeight &&
      (current.kind === 'minimap' || current.pixelsPerMeter === viewport.pixelsPerMeter) &&
      current.state === runtime.getState();
    const move = (event: PointerEvent) => {
      lastPointer = { clientX: event.clientX, clientY: event.clientY };
      const point = locate(event);
      if (drag) {
        if (event.pointerId !== drag.pointerId) return;
        if (!validDrag(drag, point.viewport)) {
          cancelDrag();
          return;
        }
        if (drag.kind === 'minimap') {
          if (point.minimap) moveFromMinimap(point.screen, point.minimap, drag.cameraOffset);
          else cancelDrag();
        } else if (drag.kind === 'pan') {
          const previous = drag.previous;
          drag.previous = point.screen;
          camera.pan(
            (previous.x - point.screen.x) / point.viewport.pixelsPerMeter,
            (previous.y - point.screen.y) / point.viewport.pixelsPerMeter,
          );
        } else if (Math.hypot(point.screen.x - drag.start.x, point.screen.y - drag.start.y) >= 5) {
          controls.rectangle = {
            start: drag.start,
            current: withinFrame(point.screen, point.viewport),
          };
        }
        return;
      }
      const unit = controls.getSingleInstallation();
      if (point.inside && unit)
        controls.manualAim(
          Math.atan2(unit.position.y - point.world.y, point.world.x - unit.position.x),
        );
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
      event.preventDefault();
      element.focus({ preventScroll: true });
      lastPointer = { clientX: event.clientX, clientY: event.clientY };
      const point = locate(event);
      // Minimap interactions take priority over selection, aiming and attack commands.
      if (point.overMinimap) {
        cancelDrag();
        stopPanning();
        if (
          event.button !== 0 ||
          !point.minimap ||
          !isInsideMinimapWorld(point.screen, point.minimap)
        )
          return;
        const position = screenToWorld(point.screen, point.minimap.viewport);
        const view = point.viewport;
        const grabbedCamera = containsPoint(
          {
            x: view.worldX,
            y: view.worldY,
            width: view.worldWidth,
            height: view.worldHeight,
          },
          position,
        );
        const cameraOffset = grabbedCamera
          ? {
              x: position.x - (view.worldX + view.worldWidth / 2),
              y: position.y - (view.worldY + view.worldHeight / 2),
            }
          : { x: 0, y: 0 };
        drag = {
          kind: 'minimap',
          pointerId: event.pointerId,
          button: event.button,
          start: point.screen,
          previous: point.screen,
          cameraOffset,
          additive: false,
          width: element.clientWidth,
          height: element.clientHeight,
          pixelsPerMeter: view.pixelsPerMeter,
          state: runtime.getState(),
        };
        element.dataset.panning = 'true';
        element.setPointerCapture(event.pointerId);
        moveFromMinimap(point.screen, point.minimap, cameraOffset);
        return;
      }
      if (event.button === 2) {
        cancelDrag();
        if (controls.inputMode === 'attackGround') {
          controls.cancelTargeting();
          return;
        }
        if (point.unit && point.unit.ownerPlayerId !== controls.playerId)
          controls.attackTarget(point.unit.id, event.shiftKey);
        return;
      }
      if (!point.inside) return;
      const panning = event.button === 1 || (event.button === 0 && event.altKey);
      if (!panning && controls.inputMode === 'attackGround') {
        controls.attackGround(point.world, event.shiftKey);
        return;
      }
      cancelDrag();
      stopPanning();
      drag = {
        kind: panning ? 'pan' : 'selection',
        pointerId: event.pointerId,
        button: event.button,
        start: point.screen,
        previous: point.screen,
        cameraOffset: { x: 0, y: 0 },
        additive: event.shiftKey,
        width: element.clientWidth,
        height: element.clientHeight,
        pixelsPerMeter: point.viewport.pixelsPerMeter,
        state: runtime.getState(),
      };
      if (panning) element.dataset.panning = 'true';
      element.setPointerCapture(event.pointerId);
    };
    const up = (event: PointerEvent) => {
      if (!drag || event.button !== drag.button || event.pointerId !== drag.pointerId) return;
      const current = drag;
      const point = locate(event);
      if (!validDrag(current, point.viewport) || current.kind === 'pan') {
        cancelDrag();
        return;
      }
      if (current.kind === 'minimap') {
        if (point.minimap) moveFromMinimap(point.screen, point.minimap, current.cameraOffset);
        cancelDrag();
        runtime.setCursorPosition(null);
        controls.selection.hoveredEntityId = undefined;
        return;
      }
      if (controls.rectangle) {
        const visibleUnits = runtime.getState().units.filter((unit) => {
          const screen = worldToScreen(hitboxCenter(unit.position, unit.hitbox), point.viewport);
          return (
            isInsideViewport(screen, point.viewport) &&
            (!point.minimap || !containsPoint(point.minimap.panel, screen))
          );
        });
        const ids = boxSelection(
          { start: current.start, current: withinFrame(point.screen, point.viewport) },
          visibleUnits,
          controls.playerId,
          (position) => worldToScreen(position, point.viewport),
        );
        controls.setSelection(
          current.additive ? [...controls.selection.selectedEntityIds, ...ids] : ids,
        );
      } else if (point.inside) {
        controls.setSelection(
          clickSelection(controls.selection, point.unit, controls.playerId, current.additive),
        );
        controls.inspectedEntityId = point.unit?.id ?? null;
      }
      cancelDrag();
    };
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return;
      lastPointer = { clientX: event.clientX, clientY: event.clientY };
      const point = locate(event);
      if (point.overMinimap) {
        event.preventDefault();
        return;
      }
      if (!point.inside) return;
      event.preventDefault();
      cancelDrag();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 300 : 1);
      camera.setZoom(camera.getZoom() * Math.exp(-clamp(delta, -240, 240) * 0.0015), point.world);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.code === 'Escape' && (drag || controls.inputMode === 'attackGround')) {
        event.preventDefault();
        cancelDrag();
        stopPanning();
        controls.cancelTargeting();
        return;
      }
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('input, textarea, select, button, [contenteditable="true"]')
      )
        return;
      if (event.altKey || event.metaKey) return;
      const group = /^Digit([1-9])$/.exec(event.code)?.[1];
      if (group) {
        event.preventDefault();
        if (!event.repeat) {
          if (event.ctrlKey) controls.saveGroup(Number(group));
          else controls.recallGroup(Number(group));
        }
        return;
      }
      if (event.ctrlKey) return;
      if (event.code.startsWith('Arrow')) {
        event.preventDefault();
        if (event.shiftKey && (event.code === 'ArrowLeft' || event.code === 'ArrowRight')) {
          stopPanning();
          const unit = controls.getSingleInstallation();
          if (unit)
            controls.manualAim(
              runtime.getRequestedAim(unit.id) +
                toRadians(runtime.getConfig().cannon.aimStepDeg) *
                  (event.code === 'ArrowLeft' ? -1 : 1),
            );
        } else {
          cancelDrag();
          panKeys.add(event.code);
          updateDirection();
        }
        return;
      }
      switch (event.code) {
        case 'F3':
        case 'F4':
        case 'F5':
          event.preventDefault();
          if (!event.repeat)
            onToggleTerrainDebug(
              event.code === 'F3'
                ? 'collisionMask'
                : event.code === 'F4'
                  ? 'terrainChunks'
                  : 'terrainDirtyRects',
            );
          break;
        case 'KeyA':
          event.preventDefault();
          if (!event.repeat) {
            cancelDrag();
            controls.startTargeting(event.shiftKey);
          }
          break;
        case 'KeyS':
          event.preventDefault();
          if (!event.repeat) controls.stop(event.shiftKey);
          break;
        case 'Escape':
          event.preventDefault();
          cancelDrag();
          stopPanning();
          controls.cancelTargeting();
          break;
        case 'Space':
          event.preventDefault();
          if (!event.repeat) controls.manualFire();
          break;
        case 'KeyQ':
        case 'KeyW':
        case 'KeyE':
          event.preventDefault();
          if (!event.repeat)
            controls.setWeapon(
              event.code === 'KeyQ'
                ? 'basicCannon'
                : event.code === 'KeyW'
                  ? 'mortar'
                  : 'heavyPenetrator',
            );
          break;
        case 'KeyP':
          event.preventDefault();
          if (!event.repeat) onPause();
          break;
        case 'KeyR':
          event.preventDefault();
          if (!event.repeat) {
            cancelDrag();
            stopPanning();
            onReset();
            controls.sync();
          }
          break;
      }
    };
    const keyup = (event: KeyboardEvent) => {
      if (panKeys.delete(event.code)) updateDirection();
    };
    const leave = () => {
      lastPointer = null;
      delete element.dataset.minimap;
      runtime.setCursorPosition(null);
      controls.selection.hoveredEntityId = undefined;
    };
    const blur = () => {
      cancelDrag();
      stopPanning();
      controls.cancelTargeting();
      leave();
    };
    const refreshView = () => {
      if (drag && drag.state !== runtime.getState()) {
        cancelDrag();
        stopPanning();
      }
      if (drag?.kind === 'selection') cancelDrag();
      if (lastPointer) locate(lastPointer);
      else {
        runtime.setCursorPosition(null);
        controls.selection.hoveredEntityId = undefined;
      }
    };
    const unsubscribe = camera.subscribe(refreshView);
    const observer = new ResizeObserver(() => {
      cancelDrag();
      refreshView();
    });
    observer.observe(element);
    const preventContextMenu = (event: MouseEvent) => event.preventDefault();
    const preventAuxClick = (event: MouseEvent) => {
      if (event.button === 1) event.preventDefault();
    };
    element.addEventListener('contextmenu', preventContextMenu);
    element.addEventListener('auxclick', preventAuxClick);
    element.addEventListener('wheel', wheel, { passive: false });
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerdown', down);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', cancelDrag);
    element.addEventListener('lostpointercapture', cancelDrag);
    element.addEventListener('pointerleave', leave);
    element.addEventListener('blur', blur);
    window.addEventListener('blur', blur);
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    return () => {
      unsubscribe();
      observer.disconnect();
      blur();
      element.removeEventListener('contextmenu', preventContextMenu);
      element.removeEventListener('auxclick', preventAuxClick);
      element.removeEventListener('wheel', wheel);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', cancelDrag);
      element.removeEventListener('lostpointercapture', cancelDrag);
      element.removeEventListener('pointerleave', leave);
      element.removeEventListener('blur', blur);
      window.removeEventListener('blur', blur);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
    };
  }, [surface, runtime, controls, onPause, onReset, onToggleTerrainDebug]);
}
