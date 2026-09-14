import { useEffect, type RefObject } from 'react';
import type { GameRuntime } from '../core/GameRuntime';
import { clamp, toRadians } from '../math/Vec2';
import { fitWorld, screenToWorld } from '../rendering/viewport';

export function useGameInput(
  surface: RefObject<HTMLDivElement | null>,
  runtime: GameRuntime,
  onPause: () => void,
  onReset: () => void,
): void {
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const aim = (event: PointerEvent) => {
      const bounds = element.getBoundingClientRect();
      const config = runtime.getConfig();
      const point = screenToWorld(
        { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
        fitWorld(bounds.width, bounds.height, config.world),
      );
      if (
        point.x < 0 ||
        point.y < 0 ||
        point.x > config.world.widthMeters ||
        point.y > config.world.heightMeters
      )
        return false;
      const cannon = runtime.getState().cannon;
      runtime.enqueueCommand({
        type: 'setAim',
        cannonId: cannon.id,
        angleRad: Math.atan2(cannon.position.y - point.y, point.x - cannon.position.x),
      });
      return true;
    };
    const fire = (event: PointerEvent) => {
      if (event.button !== 0 || !aim(event)) return;
      element.focus({ preventScroll: true });
      runtime.enqueueCommand({ type: 'fire', cannonId: runtime.getState().cannon.id });
    };
    const keydown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('input, textarea, select, button, [contenteditable="true"]')
      )
        return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const cannon = runtime.getState().cannon;
      const config = runtime.getConfig();
      switch (event.code) {
        case 'Digit1':
        case 'Digit2':
          event.preventDefault();
          if (!event.repeat)
            runtime.enqueueCommand({
              type: 'setWeapon',
              cannonId: cannon.id,
              weaponId: event.code === 'Digit1' ? 'basicCannon' : 'mortar',
            });
          break;
        case 'KeyA':
        case 'ArrowLeft':
        case 'KeyD':
        case 'ArrowRight': {
          event.preventDefault();
          const direction = event.code === 'KeyA' || event.code === 'ArrowLeft' ? -1 : 1;
          const angleRad = clamp(
            runtime.getRequestedAim() + toRadians(config.cannon.aimStepDeg) * direction,
            toRadians(config.cannon.minAngleDeg),
            toRadians(config.cannon.maxAngleDeg),
          );
          runtime.enqueueCommand({ type: 'setAim', cannonId: cannon.id, angleRad });
          break;
        }
        case 'Space':
          event.preventDefault();
          if (!event.repeat) runtime.enqueueCommand({ type: 'fire', cannonId: cannon.id });
          break;
        case 'KeyP':
          event.preventDefault();
          if (!event.repeat) onPause();
          break;
        case 'KeyR':
          event.preventDefault();
          if (!event.repeat) onReset();
          break;
      }
    };
    element.addEventListener('pointermove', aim);
    element.addEventListener('pointerdown', fire);
    window.addEventListener('keydown', keydown);
    return () => {
      element.removeEventListener('pointermove', aim);
      element.removeEventListener('pointerdown', fire);
      window.removeEventListener('keydown', keydown);
    };
  }, [surface, runtime, onPause, onReset]);
}
