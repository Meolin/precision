import type { Texture } from 'pixi.js';

export const maxTerrainGlowSources = 4;

/** Renderer-owned alpha texture and affine world-space sampling data. */
export interface TerrainGlowSource {
  mask: Texture;
  worldToMask: readonly [number, number, number, number, number, number];
  haloBasis: readonly [number, number, number, number];
  bounds: readonly [number, number, number, number];
  strength: number;
  opacity: number;
  color: number;
}

export function terrainGlowsForBounds(
  sources: readonly TerrainGlowSource[],
  origin: readonly [number, number],
  size: readonly [number, number],
): TerrainGlowSource[] {
  return sources
    .filter((source) => {
      const [x, y, width, height] = source.bounds;
      return (
        source.strength > 0 &&
        source.opacity > 0 &&
        x < origin[0] + size[0] &&
        y < origin[1] + size[1] &&
        x + width > origin[0] &&
        y + height > origin[1]
      );
    })
    .sort((a, b) => b.strength * b.opacity - a.strength * a.opacity)
    .slice(0, maxTerrainGlowSources);
}
