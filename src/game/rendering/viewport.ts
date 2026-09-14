import type { GameConfig } from '../config/GameConfig';
import type { Vec2 } from '../math/Vec2';

export interface Viewport {
  pixelsPerMeter: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export function fitWorld(width: number, height: number, world: GameConfig['world']): Viewport {
  const nominalWidth = world.widthMeters * world.pixelsPerMeter;
  const nominalHeight = world.heightMeters * world.pixelsPerMeter;
  const scale = Math.min(width / nominalWidth, height / nominalHeight);
  const pixelsPerMeter = world.pixelsPerMeter * scale;
  return {
    pixelsPerMeter,
    offsetX: (width - nominalWidth * scale) / 2,
    offsetY: (height - nominalHeight * scale) / 2,
    width: world.widthMeters * pixelsPerMeter,
    height: world.heightMeters * pixelsPerMeter,
  };
}

export function screenToWorld(point: Vec2, viewport: Viewport): Vec2 {
  return {
    x: (point.x - viewport.offsetX) / viewport.pixelsPerMeter,
    y: (point.y - viewport.offsetY) / viewport.pixelsPerMeter,
  };
}
