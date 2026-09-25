import type {
  BuildingAnimationKeyframe,
  BuildingAnimationStage,
  BuildingAnimationTrack,
  BuildingAnimationTrackProperty,
} from './BuildingAnimationConfig';

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function defaultTrackValue(
  stage: BuildingAnimationStage,
  property: BuildingAnimationTrackProperty,
): number {
  switch (property) {
    case 'x':
      return stage.x;
    case 'y':
      return stage.y;
    case 'scaleX':
      return stage.scaleX;
    case 'scaleY':
      return stage.scaleY;
    case 'opacity':
      return stage.opacity;
    case 'rotation':
      return stage.rotation;
    case 'skewX':
      return stage.skewX;
    case 'skewY':
      return stage.skewY;
    case 'pivotX':
      return stage.pivotX;
    case 'pivotY':
      return stage.pivotY;
    default:
      return 0;
  }
}

function cubic(point1: number, point2: number, time: number): number {
  const inverse = 1 - time;
  return 3 * inverse * inverse * time * point1 + 3 * inverse * time * time * point2 + time ** 3;
}

export function keyInterpolation(amount: number, key: BuildingAnimationKeyframe): number {
  const value = clamp01(amount);
  switch (key.interpolation) {
    case 'step':
      return 0;
    case 'ease-in':
      return value ** 2;
    case 'ease-out':
      return 1 - (1 - value) ** 2;
    case 'ease-in-out':
      return value < 0.5 ? 2 * value ** 2 : 1 - (-2 * value + 2) ** 2 / 2;
    case 'cubic-bezier': {
      const [x1, y1, x2, y2] = key.bezier;
      let low = 0;
      let high = 1;
      for (let index = 0; index < 20; index++) {
        const midpoint = (low + high) / 2;
        if (cubic(x1, x2, midpoint) < value) low = midpoint;
        else high = midpoint;
      }
      return cubic(y1, y2, (low + high) / 2);
    }
    default:
      return value;
  }
}

export function sampleBuildingTrack(
  track: BuildingAnimationTrack | undefined,
  progress: number,
  fallback: number,
): number {
  const keys = track?.keys;
  if (!keys?.length) return fallback;
  const time = clamp01(progress);
  if (time <= keys[0]!.time) return keys[0]!.value;
  for (let index = 1; index < keys.length; index++) {
    const next = keys[index]!;
    if (time > next.time) continue;
    if (time === next.time) return next.value;
    const previous = keys[index - 1]!;
    const amount = (time - previous.time) / Math.max(0.000001, next.time - previous.time);
    const eased = keyInterpolation(amount, previous);
    return previous.value + (next.value - previous.value) * eased;
  }
  return keys[keys.length - 1]!.value;
}
