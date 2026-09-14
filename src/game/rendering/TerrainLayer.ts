import { Sprite, Texture } from 'pixi.js';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import { TerrainMaterialId } from '../terrain/TerrainMaterialId';
import { terrainMaterialVisuals } from './terrainMaterialVisuals';

/** Only this adapter turns simulation material IDs into pixels. */
export class TerrainLayer {
  readonly sprite = new Sprite();
  private grid: TerrainGrid | null = null;
  private version = -1;
  private canvas = document.createElement('canvas');
  private texture: Texture | null = null;

  update(terrain: TerrainGrid): void {
    if (terrain === this.grid && terrain.version === this.version) return;
    const resized = this.canvas.width !== terrain.columns || this.canvas.height !== terrain.rows;
    this.canvas.width = terrain.columns;
    this.canvas.height = terrain.rows;
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable.');
    const image = context.createImageData(terrain.columns, terrain.rows);
    for (let row = 0; row < terrain.rows; row++)
      for (let col = 0; col < terrain.columns; col++) {
        const material = terrain.getMaterialAtCell(col, row);
        if (material === TerrainMaterialId.Air) continue;
        const visual = terrainMaterialVisuals[material];
        const edge =
          !terrain.isSolid(col, row - 1) ||
          !terrain.isSolid(col - 1, row) ||
          !terrain.isSolid(col + 1, row);
        const nearSurface = !terrain.isSolid(col, row - 3);
        const grain = ((col * 13 + row * 7) % 11) - 5;
        const band = Math.floor(row / 18) % 2 === 0 ? 3 : 0;
        const color = edge
          ? visual.edge
          : nearSurface
            ? visual.surface
            : visual.body.map((value) => value + grain + band);
        const index = (row * terrain.columns + col) * 4;
        image.data[index] = color[0] ?? 0;
        image.data[index + 1] = color[1] ?? 0;
        image.data[index + 2] = color[2] ?? 0;
        image.data[index + 3] = 255;
      }
    context.putImageData(image, 0, 0);
    if (!this.texture || resized) {
      this.texture?.destroy(true);
      this.texture = Texture.from(this.canvas, true);
      this.texture.source.scaleMode = 'nearest';
      this.sprite.texture = this.texture;
    } else this.texture.source.update();
    this.sprite.width = terrain.columns * terrain.cellSizeMeters;
    this.sprite.height = terrain.rows * terrain.cellSizeMeters;
    this.grid = terrain;
    this.version = terrain.version;
  }

  destroy(): void {
    this.sprite.destroy();
    this.texture?.destroy(true);
  }
}
