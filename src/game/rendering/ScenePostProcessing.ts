import {
  BlurFilter,
  ColorMatrixFilter,
  Container,
  DisplacementFilter,
  Graphics,
  NoiseFilter,
  Rectangle,
  Sprite,
  type Filter,
} from 'pixi.js';
import {
  AdvancedBloomFilter,
  BevelFilter,
  DropShadowFilter,
  GlowFilter,
  MotionBlurFilter,
  OutlineFilter,
} from 'pixi-filters';
import type { GameRuntime, RecentExplosion } from '../core/GameRuntime';
import { lerp } from '../math/Vec2';
import { shaderValue, type ShaderId, type ShaderSettings } from './ShaderSettings';
import { TerrainEffectMaps } from './TerrainEffectMaps';
import type { CameraViewport } from './viewport';
import { WorldLightmapFilter, WorldShockwaveFilter } from './WorldSpaceFilters';

interface Layers {
  content: Container;
  background: Graphics;
  terrain: Sprite;
  cannonBases: Container;
}

/** Owns GPU resources and transient visuals; all simulation inputs are read-only. */
export class ScenePostProcessing {
  private combat = new Container();
  private flashes = new Graphics();
  private maps = new TerrainEffectMaps();
  private mapSprite = new Sprite(this.maps.heatTexture);
  private color = new ColorMatrixFilter();
  private noise = new NoiseFilter({ seed: 0.37 });
  private blur = new BlurFilter({ quality: 2 });
  private bevel = new BevelFilter();
  private lightmap = new WorldLightmapFilter(this.maps.lightTexture, this.mapSprite);
  private shadow = new DropShadowFilter({ quality: 2 });
  private outline = new OutlineFilter({ quality: 0.2 });
  private glow = new GlowFilter({ distance: 8, quality: 0.1 });
  private bloom = new AdvancedBloomFilter({ quality: 3 });
  private heat = new DisplacementFilter({ sprite: this.mapSprite });
  private projectiles = new Map<number, { graphic: Graphics; motion: MotionBlurFilter | null }>();
  private waves = new Map<RecentExplosion, WorldShockwaveFilter>();
  private settings: ShaderSettings | null = null;
  private stateIdentity: object | null = null;
  private area = new Rectangle();
  private terrainArea = new Rectangle();

  constructor(private layers: Layers) {
    this.combat.addChild(this.flashes);
    layers.content.addChild(this.combat, this.mapSprite);
    layers.content.filterArea = this.area;
    layers.terrain.filterArea = this.terrainArea;
    layers.background.filterArea = this.area;
  }

  private assign(target: Container, filters: Filter[]): void {
    const previous = target.filters;
    if (
      previous?.length === filters.length &&
      previous.every((filter, index) => filter === filters[index])
    )
      return;
    if (!previous && !filters.length) return;
    target.filters = filters.length ? filters : null;
  }

  update(
    runtime: GameRuntime,
    settings: ShaderSettings,
    viewport: CameraViewport,
    sprites: ReadonlyMap<number, Sprite>,
    selectedIds: readonly number[],
  ): void {
    const state = runtime.getState();
    const time = runtime.presentationTimeSeconds;
    const ppm = viewport.pixelsPerMeter;
    const enabled = (id: ShaderId) => settings.enabled && settings.effects[id].enabled;
    const value = (id: ShaderId, key: string) => shaderValue(settings, id, key);
    // Bound full-scene passes to the camera, not the entire enlarged map.
    // Pixi v8 filterArea is local: content uses meters, terrain uses texture cells.
    this.area.x = viewport.worldX;
    this.area.y = viewport.worldY;
    this.area.width = viewport.worldWidth;
    this.area.height = viewport.worldHeight;
    this.terrainArea.x = viewport.worldX / state.terrain.cellSizeMeters;
    this.terrainArea.y = viewport.worldY / state.terrain.cellSizeMeters;
    this.terrainArea.width = viewport.worldWidth / state.terrain.cellSizeMeters;
    this.terrainArea.height = viewport.worldHeight / state.terrain.cellSizeMeters;
    this.mapSprite.width = state.terrain.columns * state.terrain.cellSizeMeters;
    this.mapSprite.height = state.terrain.rows * state.terrain.cellSizeMeters;
    if (this.stateIdentity !== state) {
      this.clearTransient();
      this.stateIdentity = state;
    }

    if (this.settings !== settings) {
      this.color.reset();
      this.color.brightness(value('color', 'brightness'), true);
      this.color.contrast(value('color', 'contrast'), true);
      this.color.saturate(value('color', 'saturation'), true);
      this.color.hue(value('color', 'hue'), true);
      this.noise.noise = value('noise', 'strength');
      this.blur.strength = value('blur', 'strength');
      this.bevel.thickness = value('bevel', 'thickness');
      this.bevel.rotation = value('bevel', 'rotation');
      this.bevel.lightAlpha = value('bevel', 'light');
      this.bevel.shadowAlpha = value('bevel', 'shadow');
      this.lightmap.alpha = value('lightmap', 'ambient');
      this.shadow.alpha = value('shadow', 'alpha');
      this.shadow.blur = value('shadow', 'blur');
      this.shadow.offset = { x: value('shadow', 'offsetX'), y: value('shadow', 'offsetY') };
      this.outline.thickness = value('outline', 'thickness');
      this.outline.color = value('outline', 'color');
      this.glow.outerStrength = value('glow', 'strength');
      this.glow.color = value('glow', 'color');
      this.bloom.threshold = value('bloom', 'threshold');
      this.bloom.bloomScale = value('bloom', 'strength');
      this.bloom.blur = value('bloom', 'blur');
      this.heat.scale.set(value('heat', 'strength'));
      this.assign(this.layers.terrain, [
        ...(enabled('bevel') ? [this.bevel] : []),
        ...(enabled('lightmap') ? [this.lightmap] : []),
      ]);
      this.assign(this.layers.background, enabled('blur') ? [this.blur] : []);
      this.assign(this.layers.cannonBases, enabled('shadow') ? [this.shadow] : []);
      this.assign(this.combat, [
        ...(enabled('glow') ? [this.glow] : []),
        ...(enabled('bloom') ? [this.bloom] : []),
      ]);
      this.settings = settings;
    }
    for (const [id, sprite] of sprites) {
      const selected =
        selectedIds.includes(id) && state.units.some((unit) => unit.id === id && unit.alive);
      this.assign(sprite, enabled('outline') && selected ? [this.outline] : []);
    }

    const explosions = runtime.getRecentExplosions();
    if (settings.enabled && (enabled('lightmap') || enabled('heat')))
      this.maps.update(state.terrain, settings, explosions, time);
    const activeHeat =
      enabled('heat') &&
      explosions.some((item) => time - item.timeSeconds < value('heat', 'duration'));
    // Bound simultaneous full-scene passes while retaining every flash and light.
    const activeWaves = enabled('shockwave')
      ? explosions
          .filter((item) => time - item.timeSeconds < value('shockwave', 'duration'))
          .slice(-4)
      : [];
    for (const [item, filter] of this.waves) {
      if (activeWaves.includes(item)) continue;
      this.waves.delete(item);
      filter.destroy();
    }
    const sceneFilters: Filter[] = [];
    if (activeHeat) sceneFilters.push(this.heat);
    for (const item of activeWaves) {
      let filter = this.waves.get(item);
      if (!filter) {
        filter = new WorldShockwaveFilter(this.mapSprite);
        this.waves.set(item, filter);
      }
      const point = item.event.resolution.explosion.position;
      filter.mapPosition = {
        x: point.x / this.mapSprite.width,
        y: point.y / this.mapSprite.height,
      };
      filter.speed = value('shockwave', 'speed') * ppm;
      filter.amplitude = value('shockwave', 'amplitude');
      filter.wavelength = value('shockwave', 'width') * ppm;
      filter.radius = filter.speed * value('shockwave', 'duration');
      filter.brightness = 1.1;
      filter.time = Math.max(0, time - item.timeSeconds);
      sceneFilters.push(filter);
    }
    if (enabled('color')) sceneFilters.push(this.color);
    if (enabled('noise')) sceneFilters.push(this.noise);
    this.assign(this.layers.content, sceneFilters);

    const ids = new Set(state.projectiles.map((projectile) => projectile.id));
    for (const [id, visual] of this.projectiles) {
      if (ids.has(id)) continue;
      visual.graphic.destroy();
      visual.motion?.destroy();
      this.projectiles.delete(id);
    }
    for (const projectile of state.projectiles) {
      let visual = this.projectiles.get(projectile.id);
      if (!visual) {
        visual = { graphic: new Graphics(), motion: null };
        this.projectiles.set(projectile.id, visual);
        this.combat.addChild(visual.graphic);
      }
      const point = lerp(
        projectile.previousPosition,
        projectile.position,
        runtime.interpolationAlpha,
      );
      const radius = Math.max(projectile.radius, 2.8 / ppm);
      visual.graphic.position.set(point.x, point.y);
      visual.graphic
        .clear()
        .circle(0, 0, radius + 3 / ppm)
        .fill({ color: 0xf5af73, alpha: 0.14 });
      visual.graphic.circle(0, 0, radius).fill(0xffdfac);
      if (enabled('motion')) {
        visual.motion ??= new MotionBlurFilter({ kernelSize: 7 });
        const exposure = (value('motion', 'shutter') / 1000) * ppm;
        const length = Math.hypot(projectile.velocity.x, projectile.velocity.y) * exposure;
        const factor =
          exposure * Math.min(1, value('motion', 'maxLength') / Math.max(length, 0.001));
        visual.motion.velocity = {
          x: projectile.velocity.x * factor,
          y: projectile.velocity.y * factor,
        };
        this.assign(visual.graphic, [visual.motion]);
      } else this.assign(visual.graphic, []);
    }

    this.flashes.clear();
    if (settings.enabled)
      for (const item of explosions) {
        const age = Math.max(0, time - item.timeSeconds);
        if (age > 0.55) continue;
        const explosion = item.event.resolution.explosion;
        const radius = Math.max(0.5, Math.min(5, explosion.radiusMeters * 0.3)) * (0.35 + age * 2);
        const fade = (1 - age / 0.55) ** 2;
        this.flashes
          .circle(explosion.position.x, explosion.position.y, radius)
          .fill({ color: 0xffad55, alpha: fade * 0.55 });
        this.flashes
          .circle(explosion.position.x, explosion.position.y, radius * 0.35)
          .fill({ color: 0xfff2bd, alpha: fade });
      }
    this.combat.visible =
      state.projectiles.length > 0 ||
      (settings.enabled && explosions.some((item) => time - item.timeSeconds < 0.55));
  }

  private clearTransient(): void {
    for (const visual of this.projectiles.values()) {
      visual.graphic.destroy();
      visual.motion?.destroy();
    }
    this.projectiles.clear();
    this.layers.content.filters = null;
    for (const filter of this.waves.values()) filter.destroy();
    this.waves.clear();
    this.flashes.clear();
  }

  destroy(): void {
    this.clearTransient();
    this.layers.terrain.filters = null;
    this.layers.background.filters = null;
    this.layers.cannonBases.filters = null;
    for (const sprite of this.layers.cannonBases.children) sprite.filters = null;
    this.combat.filters = null;
    for (const filter of [
      this.color,
      this.noise,
      this.blur,
      this.bevel,
      this.lightmap,
      this.shadow,
      this.outline,
      this.glow,
      this.bloom,
      this.heat,
    ])
      filter.destroy();
    this.mapSprite.destroy();
    this.maps.destroy();
    this.combat.destroy({ children: true });
  }
}
