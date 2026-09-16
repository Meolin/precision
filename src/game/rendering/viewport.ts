import type { GameConfig } from '../config/GameConfig';
import type { Vec2 } from '../math/Vec2';
import { cameraFrame } from '../config/worldLayout';

export interface Viewport {
  pixelsPerMeter: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export interface CameraViewport extends Viewport {
  frameX: number;
  frameY: number;
  worldX: number;
  worldY: number;
  worldWidth: number;
  worldHeight: number;
}

/** Letterbox a fixed world-space frame; extra screen space never reveals more map. */
export function cameraViewport(
  width: number,
  height: number,
  center: Vec2,
  zoom: number,
): CameraViewport {
  const worldWidth = cameraFrame.widthMeters / zoom;
  const worldHeight = cameraFrame.heightMeters / zoom;
  const pixelsPerMeter = Math.min(
    Math.max(1, width) / worldWidth,
    Math.max(1, height) / worldHeight,
  );
  const frameWidth = worldWidth * pixelsPerMeter;
  const frameHeight = worldHeight * pixelsPerMeter;
  const frameX = (width - frameWidth) / 2;
  const frameY = (height - frameHeight) / 2;
  const worldX = center.x - worldWidth / 2;
  const worldY = center.y - worldHeight / 2;
  return {
    pixelsPerMeter,
    offsetX: frameX - worldX * pixelsPerMeter,
    offsetY: frameY - worldY * pixelsPerMeter,
    width: frameWidth,
    height: frameHeight,
    frameX,
    frameY,
    worldX,
    worldY,
    worldWidth,
    worldHeight,
  };
}

export function isInsideViewport(point: Vec2, viewport: CameraViewport): boolean {
  return (
    point.x >= viewport.frameX &&
    point.x < viewport.frameX + viewport.width &&
    point.y >= viewport.frameY &&
    point.y < viewport.frameY + viewport.height
  );
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

export function worldToScreen(point: Vec2, viewport: Viewport): Vec2 {
  return {
    x: point.x * viewport.pixelsPerMeter + viewport.offsetX,
    y: point.y * viewport.pixelsPerMeter + viewport.offsetY,
  };
}
