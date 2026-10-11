import type { RockDensityMask } from '../terrain/RockDensityMask';
import { TerrainMaterialId } from '../terrain/TerrainMaterialId';
import { terrainMaterialVisuals } from './terrainMaterialVisuals';
import { terrainRockTextureAsset, type TerrainTextureSettings } from './TerrainTextureSettings';

/** Decode companion PNGs at the browser boundary; simulation only receives numbers. */
export async function loadRockDensityMask(
  settings: TerrainTextureSettings,
): Promise<RockDensityMask | null> {
  const asset = terrainRockTextureAsset(settings.rockTextureId);
  if (!asset.densityAssetUrl) return null;
  try {
    const image = new Image();
    image.src = asset.densityAssetUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    // Bound serialized simulation input independently of the source PNG resolution.
    const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas 2D is unavailable for the Rock density mask.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const tileWidthMeters =
      terrainMaterialVisuals[TerrainMaterialId.Rock].texture?.tileWidthMeters ?? 19.2;
    return {
      sourceId: asset.id,
      width: canvas.width,
      height: canvas.height,
      tileWidthMeters,
      tileHeightMeters: tileWidthMeters * (image.naturalHeight / image.naturalWidth),
      orientation: settings.orientation,
      values: Array.from({ length: canvas.width * canvas.height }, (_, index) =>
        Math.round(
          pixels[index * 4]! * 0.2126 +
            pixels[index * 4 + 1]! * 0.7152 +
            pixels[index * 4 + 2]! * 0.0722,
        ),
      ),
    };
  } catch (error) {
    console.warn(
      `Rock density mask could not be loaded; using uniform resistance. ${String(error)}`,
    );
    return null;
  }
}
