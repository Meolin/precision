import type { GameConfig } from '../config/GameConfig';
import type { Vec2 } from '../math/Vec2';
import { fitWorld, type Viewport } from './viewport';

export interface ScreenRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MinimapLayout {
  panel: ScreenRectangle;
  viewport: Viewport;
}

export function containsPoint(rect: ScreenRectangle, point: Vec2): boolean {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  );
}

/** Rendering and input share the same layout in CSS pixels, regardless of device pixel ratio. */
export function minimapLayout(
  width: number,
  height: number,
  world: GameConfig['world'],
): MinimapLayout | null {
  if (width < 80 || height < 100) return null;
  const margin = 12;
  const padding = 8;
  const titleHeight = 16;
  const panelWidth = Math.min(260, Math.max(160, width * 0.28), width - margin * 2);
  const mapWidth = panelWidth - padding * 2;
  const mapHeight = Math.min(
    110,
    Math.max(48, (mapWidth * world.heightMeters) / world.widthMeters),
    height - margin * 2 - padding * 2 - titleHeight,
  );
  const panelHeight = mapHeight + padding * 2 + titleHeight;
  const panel = {
    x: width - margin - panelWidth,
    y: height - margin - panelHeight,
    width: panelWidth,
    height: panelHeight,
  };
  const fitted = fitWorld(mapWidth, mapHeight, world);
  return {
    panel,
    viewport: {
      ...fitted,
      offsetX: panel.x + padding + fitted.offsetX,
      offsetY: panel.y + padding + titleHeight + fitted.offsetY,
    },
  };
}

export function isInsideMinimapWorld(point: Vec2, layout: MinimapLayout): boolean {
  const { offsetX: x, offsetY: y, width, height } = layout.viewport;
  return containsPoint({ x, y, width, height }, point);
}
