import type { Vec2 } from '../math/Vec2';
import type { RockLayerMaskOrientation } from './RockLayerMask';

/** Serializable, immutable texture input; values are luminance bytes in [0, 255]. */
export interface RockDensityMask {
  readonly sourceId: string;
  readonly width: number;
  readonly height: number;
  readonly tileWidthMeters: number;
  readonly tileHeightMeters: number;
  readonly orientation: RockLayerMaskOrientation;
  readonly values: readonly number[];
}

export const minimumRockDensityResistance = 0.5;

/** The same integer hash is used by the terrain shader, avoiding CPU/GPU sine drift. */
function tileHash(x: number, y: number): number {
  let value = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177) >>> 0;
  return ((value ^ (value >>> 16)) & 0xffff) / 65536;
}

export function sampleRockDensity(mask: RockDensityMask, position: Vec2): number {
  const scaledX = position.x / mask.tileWidthMeters;
  const scaledY = position.y / mask.tileHeightMeters;
  const tileX = Math.floor(scaledX);
  const tileY = Math.floor(scaledY);
  let u = scaledX - tileX;
  let v = scaledY - tileY;
  let mirrorX = false;
  let mirrorY = false;
  let turns = 0;
  if (mask.orientation === 'mirrored') {
    mirrorX = Math.abs(tileX) % 2 === 1;
    mirrorY = Math.abs(tileY) % 2 === 1;
  } else if (mask.orientation === 'mirror-x') {
    mirrorX = Math.abs(tileX) % 2 === 1;
  } else if (mask.orientation === 'random') {
    const hash = tileHash(tileX, tileY);
    mirrorX = hash >= 0.5;
    mirrorY = (hash * 7) % 1 >= 0.5;
    turns = Math.floor(((hash * 13) % 1) * 4);
    if (Math.abs(mask.tileWidthMeters - mask.tileHeightMeters) > 0.001) turns = (turns % 2) * 2;
  }
  if (mirrorX) u = 1 - u;
  if (mirrorY) v = 1 - v;
  if (turns === 1) [u, v] = [1 - v, u];
  else if (turns === 2) [u, v] = [1 - u, 1 - v];
  else if (turns === 3) [u, v] = [v, 1 - u];

  // Linear, repeat-addressed sampling matches GPU pixel-centre addressing.
  const x = u * mask.width - 0.5;
  const y = v * mask.height - 0.5;
  const left = Math.floor(x);
  const top = Math.floor(y);
  const at = (column: number, row: number) =>
    mask.values[
      (((row % mask.height) + mask.height) % mask.height) * mask.width +
        (((column % mask.width) + mask.width) % mask.width)
    ]!;
  const upper = at(left, top) + (at(left + 1, top) - at(left, top)) * (x - left);
  const lower = at(left, top + 1) + (at(left + 1, top + 1) - at(left, top + 1)) * (x - left);
  return (upper + (lower - upper) * (y - top)) / 255;
}

/** Black = half the original resistance; white = twice; mid-grey = original. */
export function rockDensityResistance(mask: RockDensityMask, position: Vec2): number {
  return 2 ** (2 * sampleRockDensity(mask, position) - 1);
}

export function cloneRockDensityMask(mask: RockDensityMask): RockDensityMask {
  return { ...mask, values: Array.isArray(mask.values) ? [...mask.values] : [] };
}

export function rockDensityMaskKey(mask: RockDensityMask | null): string {
  return mask
    ? `${mask.sourceId}:${mask.orientation}:${mask.tileWidthMeters}:${mask.tileHeightMeters}:${mask.width}:${mask.height}:${mask.values.join(',')}`
    : '';
}
