export type RockLayerMaskOrientation = 'mirrored' | 'sequential' | 'mirror-x' | 'random';

export interface RockLayerMask {
  readonly sourceId: string;
  readonly tileWidthMeters: number;
  readonly offsetsMeters: readonly number[];
  readonly orientation: RockLayerMaskOrientation;
}

function tileHash(tile: number): number {
  let value = Math.imul(tile ^ 0x45d9f3b, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

export function sampleRockLayerMask(mask: RockLayerMask, xMeters: number): number {
  const tile = Math.floor(xMeters / mask.tileWidthMeters);
  let local = xMeters / mask.tileWidthMeters - tile;
  const mirrored =
    mask.orientation === 'mirrored' || mask.orientation === 'mirror-x'
      ? Math.abs(tile) % 2 === 1
      : mask.orientation === 'random' && (tileHash(tile) & 1) !== 0;
  if (mirrored) local = 1 - local;
  const position = local * mask.offsetsMeters.length;
  const left = Math.floor(position) % mask.offsetsMeters.length;
  const right = (left + 1) % mask.offsetsMeters.length;
  const fraction = position - Math.floor(position);
  return (
    mask.offsetsMeters[left]! + (mask.offsetsMeters[right]! - mask.offsetsMeters[left]!) * fraction
  );
}

export function rockLayerMaskKey(mask: RockLayerMask | null): string {
  return mask
    ? `${mask.sourceId}:${mask.orientation}:${mask.tileWidthMeters}:${mask.offsetsMeters.join(',')}`
    : '';
}
