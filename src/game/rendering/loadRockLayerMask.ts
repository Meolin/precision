import type { RockLayerMask } from '../terrain/RockLayerMask';
import { TerrainMaterialId } from '../terrain/TerrainMaterialId';
import { terrainMaterialVisuals } from './terrainMaterialVisuals';
import {
  terrainRockContourAssetUrl,
  terrainRockTextureAsset,
  type TerrainTextureSettings,
} from './TerrainTextureSettings';

const profileSamples = 256;

/** Browser adapter: decodes the density (or fallback alpha) contour into simulation input. */
export async function loadRockLayerMask(
  settings: TerrainTextureSettings,
): Promise<RockLayerMask | null> {
  const asset = terrainRockTextureAsset(settings.rockTextureId);
  const contourAssetUrl = terrainRockContourAssetUrl(asset);
  if (!contourAssetUrl) return null;
  const image = new Image();
  image.src = contourAssetUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D is unavailable for the Rock contour mask.');
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const edges = Array.from({ length: profileSamples }, (_, sample) => {
    const x = Math.min(
      canvas.width - 1,
      Math.floor(((sample + 0.5) / profileSamples) * canvas.width),
    );
    for (let y = 0; y < canvas.height; y++) {
      const offset = (y * canvas.width + x) * 4;
      const luminance =
        (pixels[offset]! * 0.2126 + pixels[offset + 1]! * 0.7152 + pixels[offset + 2]! * 0.0722) /
        255;
      if (luminance >= 0.5) return y / Math.max(1, canvas.height - 1);
    }
    return 1;
  });
  const mean = edges.reduce((sum, value) => sum + value, 0) / edges.length;
  const tileWidthMeters =
    terrainMaterialVisuals[TerrainMaterialId.Rock].texture?.tileWidthMeters ?? 19.2;
  return {
    sourceId: `${asset.id}:${contourAssetUrl}`,
    tileWidthMeters,
    offsetsMeters: edges.map((edge) => (edge - mean) * tileWidthMeters),
    orientation: settings.orientation,
  };
}
