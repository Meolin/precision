import { Texture } from 'pixi.js';
import {
  terrainRockTextureAsset,
  type TerrainRockTextureId,
  type TerrainTextureFormat,
} from './TerrainTextureSettings';

export interface MaterialMaps {
  height: Texture;
  normal: Texture;
}

export function normalMapAssetUrl(albedoUrl: string): string {
  return albedoUrl.replace(/(\.[^/.]+)$/, '_normal$1');
}

/** Wrapped samples make the generated maps match the rock texture's repeat addressing. */
export function buildHeightMapPixels(
  albedo: Uint8ClampedArray,
  width: number,
  height: number,
): { heightPixels: Uint8ClampedArray; heights: Float32Array } {
  if (width <= 0 || height <= 0 || albedo.length !== width * height * 4)
    throw new Error('Invalid material image dimensions.');
  const luminance = new Float32Array(width * height);
  for (let i = 0; i < luminance.length; i++) {
    const offset = i * 4;
    luminance[i] =
      ((albedo[offset] ?? 0) * 0.2126 +
        (albedo[offset + 1] ?? 0) * 0.7152 +
        (albedo[offset + 2] ?? 0) * 0.0722) /
      255;
  }
  const sample = (x: number, y: number) =>
    luminance[((y + height) % height) * width + ((x + width) % width)] ?? 0;
  const heights = new Float32Array(width * height);
  const heightPixels = new Uint8ClampedArray(albedo.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let neighbourhood = 0;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) neighbourhood += sample(x + dx, y + dy);
      const base = sample(x, y);
      const value = Math.max(
        0,
        Math.min(1, 0.5 + (base - 0.5) * 1.35 + (base - neighbourhood / 25) * 0.8),
      );
      const index = y * width + x;
      heights[index] = value;
      const offset = index * 4;
      heightPixels[offset] =
        heightPixels[offset + 1] =
        heightPixels[offset + 2] =
          Math.round(value * 255);
      heightPixels[offset + 3] = 255;
    }
  return { heightPixels, heights };
}

export function buildNormalMapPixels(
  heights: Float32Array,
  width: number,
  height: number,
): Uint8ClampedArray {
  if (width <= 0 || height <= 0 || heights.length !== width * height)
    throw new Error('Invalid height map dimensions.');
  const heightAt = (x: number, y: number) =>
    heights[((y + height) % height) * width + ((x + width) % width)] ?? 0;
  const normalPixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const dx = (heightAt(x + 1, y) - heightAt(x - 1, y)) * 2;
      const dy = (heightAt(x, y + 1) - heightAt(x, y - 1)) * 2;
      const length = Math.hypot(dx, dy, 1);
      const offset = (y * width + x) * 4;
      normalPixels[offset] = Math.round((0.5 - dx / (2 * length)) * 255);
      normalPixels[offset + 1] = Math.round((0.5 - dy / (2 * length)) * 255);
      normalPixels[offset + 2] = Math.round((0.5 + 1 / (2 * length)) * 255);
      normalPixels[offset + 3] = 255;
    }
  return normalPixels;
}

export function buildMaterialMapPixels(
  albedo: Uint8ClampedArray,
  width: number,
  height: number,
): { heightPixels: Uint8ClampedArray; normalPixels: Uint8ClampedArray } {
  const { heightPixels, heights } = buildHeightMapPixels(albedo, width, height);
  return { heightPixels, normalPixels: buildNormalMapPixels(heights, width, height) };
}

/** Renderer-owned maps are generated once per source image and reused across chunks. */
export class MaterialMapCache {
  private readonly entries = new Map<TerrainRockTextureId, Promise<MaterialMaps>>();

  get(id: TerrainRockTextureId): Promise<MaterialMaps> {
    let entry = this.entries.get(id);
    if (!entry) {
      const asset = terrainRockTextureAsset(id);
      entry = this.generate(asset.assetUrl, asset.format);
      this.entries.set(id, entry);
      void entry.catch(() => this.entries.delete(id));
    }
    return entry;
  }

  private async generate(url: string, format: TerrainTextureFormat): Promise<MaterialMaps> {
    const image = new Image();
    image.src = url;
    await image.decode();
    const width =
      format === 'albedo-normal-horizontal' ? image.naturalWidth / 2 : image.naturalWidth;
    const height = image.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas 2D is unavailable for material maps.');
    context.drawImage(image, 0, 0, width, height, 0, 0, width, height);
    const { heightPixels, heights } = buildHeightMapPixels(
      context.getImageData(0, 0, width, height).data,
      width,
      height,
    );
    const heightCanvas = document.createElement('canvas');
    heightCanvas.width = width;
    heightCanvas.height = height;
    const heightImage = context.createImageData(width, height);
    heightImage.data.set(heightPixels);
    heightCanvas.getContext('2d')!.putImageData(heightImage, 0, 0);
    const heightTexture = Texture.from(heightCanvas, true);
    const existingNormal =
      format === 'albedo-normal-horizontal'
        ? this.extractCombinedNormal(image, width, height)
        : await this.loadNormalImage(normalMapAssetUrl(url));
    let normalTexture: Texture;
    if (existingNormal) normalTexture = Texture.from(existingNormal);
    else {
      const normalCanvas = document.createElement('canvas');
      normalCanvas.width = width;
      normalCanvas.height = height;
      const normalImage = context.createImageData(width, height);
      normalImage.data.set(buildNormalMapPixels(heights, width, height));
      normalCanvas.getContext('2d')!.putImageData(normalImage, 0, 0);
      normalTexture = Texture.from(normalCanvas, true);
    }
    for (const texture of [heightTexture, normalTexture]) {
      texture.source.addressMode = 'repeat';
      texture.source.scaleMode = 'linear';
      texture.source.update();
    }
    return { height: heightTexture, normal: normalTexture };
  }

  private extractCombinedNormal(
    image: HTMLImageElement,
    width: number,
    height: number,
  ): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable for combined normal map.');
    context.drawImage(image, width, 0, width, height, 0, 0, width, height);
    return canvas;
  }

  private async loadNormalImage(url: string): Promise<HTMLImageElement | null> {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) return null;
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    } catch {
      return null;
    }
  }

  destroy(): void {
    for (const entry of this.entries.values())
      void entry.then(
        ({ height, normal }) => {
          height.destroy(true);
          normal.destroy(true);
        },
        () => undefined,
      );
    this.entries.clear();
  }
}
