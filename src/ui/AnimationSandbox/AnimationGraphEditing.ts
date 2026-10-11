import type {
  BuildingAnimationKeyframe,
  BuildingKeyInterpolation,
} from '../../game/buildings/BuildingAnimationConfig';

export interface AnimationGraphViewport {
  left: number;
  top: number;
  width: number;
  height: number;
  min: number;
  range: number;
}

export interface AnimationGraphPoint {
  time: number;
  value: number;
}

interface AnimationGraphPointer {
  x: number;
  y: number;
}

type AnimationBezier = [number, number, number, number];

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Move from the initial grab position without snapping the point to the pointer. */
export function moveAnimationGraphPoint(
  viewport: AnimationGraphViewport,
  origin: AnimationGraphPoint,
  startPointer: AnimationGraphPointer,
  pointer: AnimationGraphPointer,
): AnimationGraphPoint {
  return {
    time: origin.time + (pointer.x - startPointer.x) / Math.max(1, viewport.width),
    value:
      origin.value -
      ((pointer.y - startPointer.y) / Math.max(1, viewport.height)) * 1.45 * viewport.range,
  };
}

export function moveAnimationBezierHandle(
  start: BuildingAnimationKeyframe,
  end: BuildingAnimationKeyframe,
  bezier: AnimationBezier,
  handle: 0 | 1,
  viewport: AnimationGraphViewport,
  startPointer: AnimationGraphPointer,
  pointer: AnimationGraphPointer,
): AnimationBezier {
  const index = handle * 2;
  const timeDifference = end.time - start.time;
  const valueDifference = end.value - start.value;
  const origin = {
    time: start.time + timeDifference * bezier[index]!,
    value: start.value + valueDifference * bezier[index + 1]!,
  };
  const point = moveAnimationGraphPoint(viewport, origin, startPointer, pointer);
  const next: AnimationBezier = [...bezier];
  if (timeDifference !== 0)
    next[index] = clamp01(bezier[index]! + (point.time - origin.time) / timeDifference);
  // A flat value segment has no vertical handle movement; retain its stored easing.
  if (valueDifference !== 0)
    next[index + 1] = clamp01(bezier[index + 1]! + (point.value - origin.value) / valueDifference);
  return next;
}

export function animationKeyBezier(key: BuildingAnimationKeyframe): AnimationBezier {
  switch (key.interpolation) {
    case 'cubic-bezier':
      return [...key.bezier];
    case 'linear':
      return [1 / 3, 1 / 3, 2 / 3, 2 / 3];
    case 'ease-in':
      return [1 / 3, 0, 2 / 3, 1 / 3];
    case 'ease-out':
      return [1 / 3, 2 / 3, 2 / 3, 1];
    case 'ease-in-out':
      // This approximates the piecewise easing and requires explicit conversion.
      return [0.5, 0, 0.5, 1];
    case 'step':
      return [0, 0, 1, 1];
  }
}

export function setAnimationKeyInterpolation(
  key: BuildingAnimationKeyframe,
  interpolation: BuildingKeyInterpolation,
): void {
  if (interpolation === 'cubic-bezier' && key.interpolation !== 'cubic-bezier')
    key.bezier = animationKeyBezier(key);
  key.interpolation = interpolation;
}
