import { Texture } from 'pixi.js';
import type { RecentExplosion } from '../core/GameRuntime';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import { shaderValue, type ShaderSettings } from './ShaderSettings';

function surface() {
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable.');
  return { canvas, context };
}

/** Low-resolution maps in world coordinates, independent of camera scale. */
export class TerrainEffectMaps {
  private base = surface();
  private light = surface();
  private heat = surface();
  readonly lightTexture = Texture.from(this.light.canvas, true);
  readonly heatTexture = Texture.from(this.heat.canvas, true);
  private grid: TerrainGrid | null = null;
  private baseKey = '';
  private lightKey = '';
  private heatKey = '';
  private heatGrid: TerrainGrid | null = null;

  update(
    terrain: TerrainGrid,
    settings: ShaderSettings,
    explosions: readonly RecentExplosion[],
    time: number,
  ): void {
    const width = terrain.columns * terrain.cellSizeMeters;
    const height = terrain.rows * terrain.cellSizeMeters;
    const value = (id: 'lightmap' | 'heat', key: string) => shaderValue(settings, id, key);
    const { canvas, context } = this.base;
    const sx = canvas.width / width;
    const sy = canvas.height / height;
    const activeLights = explosions.filter((item) => time - item.timeSeconds < 0.65);
    if (settings.effects.lightmap.enabled) {
      const key = `${terrain.version}:${value('lightmap', 'ambient')}:${value('lightmap', 'depth')}`;
      const changed = this.grid !== terrain || this.baseKey !== key;
      if (changed) {
        const pixels = context.createImageData(canvas.width, canvas.height);
        for (let x = 0; x < canvas.width; x++) {
          let depth = 0;
          for (let y = 0; y < canvas.height; y++) {
            const col = Math.min(
              terrain.columns - 1,
              Math.floor(((x + 0.5) / canvas.width) * terrain.columns),
            );
            const row = Math.min(
              terrain.rows - 1,
              Math.floor(((y + 0.5) / canvas.height) * terrain.rows),
            );
            depth = terrain.isSolid(col, row) ? depth + height / canvas.height : 0;
            const level =
              255 *
              (1 - value('lightmap', 'ambient')) *
              Math.exp(-depth / value('lightmap', 'depth'));
            const index = (y * canvas.width + x) * 4;
            pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = level;
            pixels.data[index + 3] = 255;
          }
        }
        context.putImageData(pixels, 0, 0);
        this.grid = terrain;
        this.baseKey = key;
      }
      const lightKey = `${key}:${activeLights.length}:${activeLights.at(-1)?.event.resolution.explosion.sourceProjectileId}:${activeLights.length ? Math.floor(time * 30) : 'idle'}:${value('lightmap', 'flash')}:${value('lightmap', 'radius')}`;
      if (changed || lightKey !== this.lightKey) {
        const ctx = this.light.context;
        ctx.globalCompositeOperation = 'copy';
        ctx.drawImage(canvas, 0, 0);
        ctx.globalCompositeOperation = 'lighter';
        ctx.save();
        ctx.scale(sx, sy);
        for (const item of activeLights) {
          const { x, y } = item.event.resolution.explosion.position;
          const radius = value('lightmap', 'radius');
          const intensity = Math.min(
            1,
            value('lightmap', 'flash') * (1 - Math.max(0, time - item.timeSeconds) / 0.65),
          );
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
          gradient.addColorStop(0, `rgba(255,210,145,${intensity})`);
          gradient.addColorStop(1, 'rgba(255,140,70,0)');
          ctx.fillStyle = gradient;
          ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }
        ctx.restore();
        this.lightTexture.source.update();
        this.lightKey = lightKey;
      }
    }
    if (settings.effects.heat.enabled) {
      const activeHeat = explosions.filter(
        (item) => time - item.timeSeconds < value('heat', 'duration'),
      );
      const key = `${activeHeat.length}:${activeHeat.at(-1)?.event.resolution.explosion.sourceProjectileId}:${activeHeat.length ? Math.floor(time * 30) : 'idle'}:${value('heat', 'radius')}:${value('heat', 'speed')}:${value('heat', 'duration')}`;
      if (this.heatGrid !== terrain || key !== this.heatKey) {
        const pixels = this.heat.context.createImageData(canvas.width, canvas.height);
        for (let index = 0; index < pixels.data.length; index += 4) {
          pixels.data[index] = pixels.data[index + 1] = 128;
          pixels.data[index + 3] = 255;
        }
        for (const item of activeHeat) {
          const { x, y } = item.event.resolution.explosion.position;
          const radius = value('heat', 'radius');
          const fade = 1 - Math.max(0, time - item.timeSeconds) / value('heat', 'duration');
          for (
            let py = Math.max(0, Math.floor((y - radius) * sy));
            py < Math.min(canvas.height, (y + radius) * sy);
            py++
          ) {
            for (
              let px = Math.max(0, Math.floor((x - radius) * sx));
              px < Math.min(canvas.width, (x + radius) * sx);
              px++
            ) {
              const distance = Math.hypot((px + 0.5) / sx - x, (py + 0.5) / sy - y) / radius;
              if (distance >= 1) continue;
              const amplitude = (1 - distance) ** 2 * fade * 110;
              const phase = time * value('heat', 'speed') * 4;
              const index = (py * canvas.width + px) * 4;
              pixels.data[index] = pixels.data[index]! + Math.sin(py * 0.7 + phase) * amplitude;
              pixels.data[index + 1] =
                pixels.data[index + 1]! + Math.cos(px * 0.55 - phase) * amplitude;
            }
          }
        }
        this.heat.context.putImageData(pixels, 0, 0);
        this.heatTexture.source.update();
        this.heatKey = key;
        this.heatGrid = terrain;
      }
    }
  }

  destroy(): void {
    this.lightTexture.destroy(true);
    this.heatTexture.destroy(true);
  }
}
