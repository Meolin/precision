import { TerrainMaterialId } from '../terrain/TerrainMaterialId';

/** Two cells keep the four-tap cubic stencil inside the field at chunk boundaries. */
export const terrainFieldHaloCells = 2;
export const terrainFieldKernelRadiusCells = 1;
export const terrainFieldSurfaceDepthCells = 3;
export const terrainFieldDistanceRangeCells = 4;
const distanceSmoothingRadius = 4;
/** Truncated distance propagation followed by a local smoothing kernel. */
export const terrainFieldSamplePaddingCells = Math.max(
  terrainFieldDistanceRangeCells + distanceSmoothingRadius,
  terrainFieldKernelRadiusCells + terrainFieldSurfaceDepthCells,
);
export const terrainVisualInvalidationPaddingCells =
  terrainFieldHaloCells + terrainFieldSamplePaddingCells;

export interface TerrainVisualFieldInput {
  readonly materials: Uint8Array;
  readonly sampleWidth: number;
  readonly sampleHeight: number;
  readonly outputWidth: number;
  readonly outputHeight: number;
  readonly samplePadding: number;
  readonly surfaceRows?: Float64Array;
}

const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1] as const;
const distanceKernel = [1, 8, 28, 56, 70, 56, 28, 8, 1] as const;

/** Bounded chamfer distance to a material class, in cell units. */
function distanceToClass(input: TerrainVisualFieldInput, solid: boolean): Float32Array {
  const { materials, sampleWidth: width, sampleHeight: height } = input;
  const limit = terrainFieldDistanceRangeCells + 0.5;
  const distance = Float32Array.from(materials, (material) =>
    (material !== TerrainMaterialId.Air) === solid ? 0 : limit,
  );
  const diagonal = Math.SQRT2;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      let value = distance[index]!;
      if (x > 0) value = Math.min(value, distance[index - 1]! + 1);
      if (y > 0) {
        value = Math.min(value, distance[index - width]! + 1);
        if (x > 0) value = Math.min(value, distance[index - width - 1]! + diagonal);
        if (x + 1 < width) value = Math.min(value, distance[index - width + 1]! + diagonal);
      }
      distance[index] = value;
    }
  for (let y = height - 1; y >= 0; y--)
    for (let x = width - 1; x >= 0; x--) {
      const index = y * width + x;
      let value = distance[index]!;
      if (x + 1 < width) value = Math.min(value, distance[index + 1]! + 1);
      if (y + 1 < height) {
        value = Math.min(value, distance[index + width]! + 1);
        if (x > 0) value = Math.min(value, distance[index + width - 1]! + diagonal);
        if (x + 1 < width) value = Math.min(value, distance[index + width + 1]! + diagonal);
      }
      distance[index] = value;
    }
  return distance;
}

function signedDistances(input: TerrainVisualFieldInput): Float32Array {
  const toAir = distanceToClass(input, false);
  const toSolid = distanceToClass(input, true);
  return Float32Array.from(input.materials, (material, index) =>
    material === TerrainMaterialId.Air ? 0.5 - toSolid[index]! : toAir[index]! - 0.5,
  );
}

function hasThinFeature(input: TerrainVisualFieldInput, x: number, y: number): boolean {
  const { materials, sampleWidth: width, sampleHeight: height } = input;
  const solid = (px: number, py: number) =>
    materialAt(materials, width, height, px, py) !== TerrainMaterialId.Air;
  // Preserve isolated cells, narrow walls, and narrow air channels, including their neighbours.
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const px = x + dx;
      const py = y + dy;
      const center = solid(px, py);
      if (
        (solid(px - 1, py) !== center && solid(px + 1, py) !== center) ||
        (solid(px, py - 1) !== center && solid(px, py + 1) !== center)
      )
        return true;
    }
  return false;
}

function materialAt(
  materials: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): TerrainMaterialId {
  if (x < 0 || y < 0 || x >= width || y >= height) return TerrainMaterialId.Air;
  return materials[y * width + x] as TerrainMaterialId;
}

function shadeAt(
  materials: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  if (materialAt(materials, width, height, x, y) === TerrainMaterialId.Air) return 0;
  const exposed =
    materialAt(materials, width, height, x, y - 1) === TerrainMaterialId.Air ||
    materialAt(materials, width, height, x - 1, y) === TerrainMaterialId.Air ||
    materialAt(materials, width, height, x + 1, y) === TerrainMaterialId.Air;
  if (exposed) return 255;
  return materialAt(materials, width, height, x, y - terrainFieldSurfaceDepthCells) ===
    TerrainMaterialId.Air
    ? 128
    : 0;
}

/**
 * R encodes a smoothed, truncated signed distance (positive inside); G is the local Rock
 * fraction, B is the body/surface/edge shade, and A keeps every data texel opaque so
 * premultiplied-alpha uploads cannot erase the distance on the air side. The sign of R at
 * cell centres is exact occupancy. Thin features use the unsmoothed distance locally.
 */
export function buildTerrainVisualField(input: TerrainVisualFieldInput): Uint8Array {
  const { materials, sampleWidth, sampleHeight, outputWidth, outputHeight, samplePadding } = input;
  if (
    !Number.isInteger(sampleWidth) ||
    !Number.isInteger(sampleHeight) ||
    !Number.isInteger(outputWidth) ||
    !Number.isInteger(outputHeight) ||
    !Number.isInteger(samplePadding) ||
    sampleWidth <= 0 ||
    sampleHeight <= 0 ||
    outputWidth <= 0 ||
    outputHeight <= 0 ||
    samplePadding < terrainFieldSamplePaddingCells ||
    materials.length !== sampleWidth * sampleHeight ||
    (input.surfaceRows !== undefined &&
      (input.surfaceRows.length !== sampleWidth ||
        input.surfaceRows.some((value) => Number.isNaN(value) || value === -Infinity))) ||
    sampleWidth < outputWidth + samplePadding * 2 ||
    sampleHeight < outputHeight + samplePadding * 2
  )
    throw new Error('Invalid terrain visual field dimensions.');

  // Keep the original fractional contour. Reconstruct only edits from the binary map:
  // intersection with the complement of removed cells, then union with added cells.
  const surfaceRows = input.surfaceRows;
  let distances: Float32Array;
  let additions: Float32Array | undefined;
  if (surfaceRows) {
    const remaining = new Uint8Array(materials.length).fill(TerrainMaterialId.Soil);
    const added = new Uint8Array(materials.length);
    let hasRemoved = false;
    let hasAdded = false;
    for (let y = 0; y < sampleHeight; y++)
      for (let x = 0; x < sampleWidth; x++) {
        const index = y * sampleWidth + x;
        const originallySolid = y + 0.5 >= surfaceRows[x]!;
        const currentlySolid = materials[index] !== TerrainMaterialId.Air;
        if (originallySolid && !currentlySolid) {
          remaining[index] = TerrainMaterialId.Air;
          hasRemoved = true;
        } else if (!originallySolid && currentlySolid) {
          added[index] = TerrainMaterialId.Soil;
          hasAdded = true;
        }
      }
    distances = hasRemoved
      ? signedDistances({ ...input, materials: remaining })
      : new Float32Array(materials.length).fill(terrainFieldDistanceRangeCells);
    if (hasAdded) additions = signedDistances({ ...input, materials: added });
  } else distances = signedDistances(input);
  const field = new Uint8Array(outputWidth * outputHeight * 4);
  for (let outputY = 0; outputY < outputHeight; outputY++)
    for (let outputX = 0; outputX < outputWidth; outputX++) {
      const centerX = outputX + samplePadding;
      const centerY = outputY + samplePadding;
      const centerMaterial = materialAt(materials, sampleWidth, sampleHeight, centerX, centerY);
      const centerSolid = centerMaterial !== TerrainMaterialId.Air;
      let occupiedWeight = 0;
      let rockWeight = 0;
      let shadeWeight = 0;
      let kernelIndex = 0;
      for (let offsetY = -1; offsetY <= 1; offsetY++)
        for (let offsetX = -1; offsetX <= 1; offsetX++, kernelIndex++) {
          const weight = kernel[kernelIndex] ?? 0;
          const x = centerX + offsetX;
          const y = centerY + offsetY;
          const material = materialAt(materials, sampleWidth, sampleHeight, x, y);
          if (material === TerrainMaterialId.Air) continue;
          occupiedWeight += weight;
          if (material === TerrainMaterialId.Rock) rockWeight += weight;
          shadeWeight += shadeAt(materials, sampleWidth, sampleHeight, x, y) * weight;
        }

      let distance = distances[centerY * sampleWidth + centerX]!;
      if (
        Math.abs(distance) < terrainFieldDistanceRangeCells &&
        !hasThinFeature(input, centerX, centerY)
      ) {
        distance = 0;
        for (let dy = -distanceSmoothingRadius; dy <= distanceSmoothingRadius; dy++)
          for (let dx = -distanceSmoothingRadius; dx <= distanceSmoothingRadius; dx++)
            distance +=
              (distances[(centerY + dy) * sampleWidth + centerX + dx]! *
                distanceKernel[dx + distanceSmoothingRadius]! *
                distanceKernel[dy + distanceSmoothingRadius]!) /
              65536;
      }
      if (surfaceRows) {
        const surface = surfaceRows[centerX]!;
        if (Number.isFinite(surface)) {
          const left = surfaceRows[centerX - 1]!;
          const right = surfaceRows[centerX + 1]!;
          const slope =
            ((Number.isFinite(right) ? right : surface) -
              (Number.isFinite(left) ? left : surface)) /
            2;
          const initialDistance = (centerY + 0.5 - surface) / Math.hypot(1, slope);
          distance = Math.min(distance, initialDistance);
        } else distance = -terrainFieldDistanceRangeCells;
        if (additions) distance = Math.max(distance, additions[centerY * sampleWidth + centerX]!);
      }
      const boundedDistance = Math.max(
        -terrainFieldDistanceRangeCells,
        Math.min(terrainFieldDistanceRangeCells, distance),
      );
      const encoded = Math.round(
        (0.5 + boundedDistance / (2 * terrainFieldDistanceRangeCells)) * 255,
      );
      const coverage = centerSolid ? Math.max(128, encoded) : Math.min(127, encoded);
      const index = (outputY * outputWidth + outputX) * 4;
      field[index] = coverage;
      field[index + 1] = occupiedWeight > 0 ? Math.round((rockWeight / occupiedWeight) * 255) : 0;
      field[index + 2] = occupiedWeight > 0 ? Math.round(shadeWeight / occupiedWeight) : 0;
      field[index + 3] = 255;
    }

  return field;
}
