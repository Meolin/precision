import { BufferImageSource, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { BuildingAnimationConfig, BuildingAnimationStage } from './BuildingAnimationConfig';
import {
  animationLayerEntries,
  isImageStage,
  particleTailSeconds,
} from './BuildingAnimationEffects';
import {
  animationStageSampler,
  animationStageVisible,
  createParticlePlan,
  sampleParticleFrame,
  type ParticlePlan,
} from './BuildingAnimationParticles';
import {
  animationColor,
  animationResourceEnabled,
  effectOrigin,
  resourceMatrix,
} from './BuildingAnimationTransform';
import { AnimationEffectShader } from './BuildingAnimationEffectShader';

const filterModes = { blur: 0, distort: 1, ripple: 2, heat: 3, color: 4, glow: 5, outline: 6 };
/** Owned GPU resources and cached birth plans; sampling never advances a simulation clock. */
export class BuildingAnimationEffectRenderer {
  readonly generators = new Map<string, Container>();
  private filters = new Map<string, { type: string; filter: AnimationEffectShader }>();
  private pools = new Map<string, Sprite[]>();
  private rings = new Map<string, Graphics>();
  private plans = new Map<string, ParticlePlan>();
  private textures = new Map<string, Texture>();
  private frames = new Map<string, Texture[]>();
  private radial = new Map<number, Texture>();
  private contours = new Map<string, { x: number; y: number }[]>();
  private lastProgress = NaN;
  private ordered: BuildingAnimationStage[] = [];

  sync(config: BuildingAnimationConfig): void {
    this.lastProgress = NaN;
    const frameKeys = new Set(
      config.stages
        .filter((stage) => stage.kind === 'particles' && stage.particleTextureId)
        .map(
          (stage) =>
            `${stage.particleTextureId}:${stage.spriteColumns ?? 1}:${stage.spriteRows ?? 1}`,
        ),
    );
    for (const [key, frames] of this.frames)
      if (!frameKeys.has(key)) {
        for (const texture of frames) texture.destroy(false);
        this.frames.delete(key);
      }
    this.ordered = animationLayerEntries(config).map(({ stage }) => stage);
    for (const [id, node] of this.generators)
      if (
        !config.stages.some(
          (stage) => stage.id === id && ['particles', 'light', 'ring'].includes(stage.kind ?? ''),
        )
      ) {
        node.destroy({ children: true });
        this.generators.delete(id);
        this.pools.delete(id);
        this.rings.delete(id);
      }
    for (const [id, entry] of this.filters)
      if (
        !config.stages.some(
          (stage) => stage.id === id && stage.kind === 'filter' && stage.filterType === entry.type,
        )
      ) {
        entry.filter.destroy();
        this.filters.delete(id);
      }
    this.plans.clear();
    for (const stage of config.stages) {
      if (
        ['particles', 'light', 'ring'].includes(stage.kind ?? '') &&
        !this.generators.has(stage.id)
      )
        this.generators.set(stage.id, new Container());
      if (stage.kind === 'particles') this.plans.set(stage.id, createParticlePlan(config, stage));
      if (stage.kind === 'filter' && !this.filters.has(stage.id))
        this.filters.set(stage.id, {
          type: stage.filterType!,
          filter: new AnimationEffectShader(filterModes[stage.filterType!]),
        });
    }
  }
  setTextures(textures: Map<string, Texture>): void {
    for (const frames of this.frames.values()) for (const texture of frames) texture.destroy(false);
    this.frames.clear();
    this.contours.clear();
    this.textures = textures;
    this.lastProgress = NaN;
  }
  private softTexture(falloff: number): Texture {
    const key = Math.round(falloff * 4) / 4;
    let texture = this.radial.get(key);
    if (texture) return texture;
    const pixels = new Uint8Array(64 * 64 * 4);
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const i = (y * 64 + x) * 4;
        const distance = Math.hypot((x - 31.5) / 31.5, (y - 31.5) / 31.5);
        // Typed-array uploads do not premultiply pixels. Store white with premultiplied alpha.
        const alpha = Math.round(255 * Math.pow(Math.max(0, 1 - distance), key));
        pixels[i] = pixels[i + 1] = pixels[i + 2] = pixels[i + 3] = alpha;
      }
    texture = new Texture({
      source: new BufferImageSource({
        resource: pixels,
        width: 64,
        height: 64,
        alphaMode: 'premultiplied-alpha',
        format: 'rgba8unorm',
      }),
    });
    this.radial.set(key, texture);
    return texture;
  }
  private particleTextures(stage: BuildingAnimationStage): Texture[] {
    const texture = stage.particleTextureId
      ? this.textures.get(stage.particleTextureId)
      : undefined;
    if (!texture) return [this.softTexture(stage.particlePreset === 'smoke' ? 2 : 0.25)];
    const columns = stage.spriteColumns ?? 1,
      rows = stage.spriteRows ?? 1,
      key = `${stage.particleTextureId}:${columns}:${rows}`;
    let frames = this.frames.get(key);
    if (frames) return frames;
    frames = Array.from(
      { length: columns * rows },
      (_, i) =>
        new Texture({
          source: texture.source,
          frame: new Rectangle(
            texture.frame.x + ((i % columns) * texture.width) / columns,
            texture.frame.y + (Math.floor(i / columns) * texture.height) / rows,
            texture.width / columns,
            texture.height / rows,
          ),
        }),
    );
    this.frames.set(key, frames);
    return frames;
  }
  private contour(
    config: BuildingAnimationConfig,
    stage: BuildingAnimationStage,
  ): { x: number; y: number }[] | undefined {
    if (stage.emitterShape !== 'contour' || !stage.shapeSourceId) return;
    const source = config.stages.find(
      (item) => item.id === stage.shapeSourceId && isImageStage(item),
    );
    if (!source) return;
    const cached = this.contours.get(source.assetId);
    if (cached) return cached;
    const texture = this.textures.get(source.assetId);
    if (!texture) return;
    const points: { x: number; y: number }[] = [];
    try {
      const canvas = document.createElement('canvas'),
        ratio = Math.min(1, 128 / Math.max(texture.width, texture.height));
      canvas.width = Math.max(1, Math.round(texture.width * ratio));
      canvas.height = Math.max(1, Math.round(texture.height * ratio));
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      context.drawImage(
        texture.source.resource as CanvasImageSource,
        texture.frame.x,
        texture.frame.y,
        texture.width,
        texture.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const solid = (x: number, y: number) =>
        x >= 0 &&
        y >= 0 &&
        x < canvas.width &&
        y < canvas.height &&
        data[(y * canvas.width + x) * 4 + 3]! > 32;
      for (let y = 0; y < canvas.height; y++)
        for (let x = 0; x < canvas.width; x++)
          if (
            solid(x, y) &&
            (!solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1))
          )
            points.push({ x: (x + 0.5) / ratio, y: (y + 0.5) / ratio });
    } catch {
      /* Unreadable image sources retain an empty contour until assets are relinked. */
    }
    this.contours.set(source.assetId, points);
    return points;
  }
  private sprite(stageId: string, index: number, parent: Container): Sprite {
    const pool = this.pools.get(stageId) ?? [];
    if (!pool[index]) {
      pool[index] = new Sprite();
      pool[index]!.anchor.set(0.5);
      parent.addChild(pool[index]!);
      this.pools.set(stageId, pool);
    }
    return pool[index]!;
  }
  draw(config: BuildingAnimationConfig, progress: number): void {
    const changed = progress !== this.lastProgress;
    this.lastProgress = progress;
    for (const stage of config.stages) {
      const node = this.generators.get(stage.id);
      if (!node) continue;
      node.filters = null;
      if (!changed) continue;
      const sample = animationStageSampler(config, stage),
        value = (property: Parameters<typeof sample>[0]) => sample(property, progress);
      const tail = particleTailSeconds(config, stage) / config.timeline.durationSeconds;
      node.visible =
        animationResourceEnabled(config, stage) &&
        progress >= stage.inPoint &&
        (animationStageVisible(stage, progress) || progress < stage.outPoint + tail);
      if (!node.visible) continue;
      const composition = stage.kind === 'particles' && stage.particleSpace === 'composition';
      node.position.set(
        composition ? -config.origin.x : value('x') - config.origin.x,
        composition ? -config.origin.y : value('y') - config.origin.y,
      );
      node.scale.set(composition ? 1 : value('scaleX'), composition ? 1 : value('scaleY'));
      node.rotation = composition ? 0 : (value('rotation') * Math.PI) / 180;
      node.skew.set(
        composition ? 0 : (value('skewX') * Math.PI) / 180,
        composition ? 0 : (value('skewY') * Math.PI) / 180,
      );
      node.pivot.set(composition ? 0 : value('pivotX'), composition ? 0 : value('pivotY'));
      // Visual transparency must not change the sampled light emitted into terrain.
      node.alpha = value('opacity') * Math.min(1, Math.max(0, value('fxVisualOpacity')));
      node.blendMode = stage.blendMode ?? (stage.particlePreset === 'smoke' ? 'normal' : 'add');
      let used = 0;
      if (stage.kind === 'particles') {
        const frame = sampleParticleFrame(
          config,
          stage,
          progress,
          this.plans.get(stage.id)!,
          this.contour(config, stage),
        );
        const textures = this.particleTextures(stage);
        for (const particle of frame.particles) {
          const copies = particle.trail > 0 ? 4 : 1;
          for (let trail = copies - 1; trail >= 0; trail--) {
            const sprite = this.sprite(stage.id, used++, node);
            sprite.visible = true;
            sprite.texture = textures[particle.frame % textures.length]!;
            const lag = (particle.trail * trail) / 3;
            sprite.position.set(particle.x - particle.vx * lag, particle.y - particle.vy * lag);
            sprite.tint = particle.color;
            sprite.alpha = particle.alpha * (trail === 0 ? 1 : 0.25 * (1 - trail / 4));
            sprite.rotation = particle.rotation;
            const radius = particle.size;
            sprite.width =
              (radius * 2 * particle.stretch * sprite.texture.width) / sprite.texture.height;
            sprite.height = radius * 2;
          }
        }
      } else if (stage.kind === 'light') {
        for (let i = 0; i < Math.ceil(value('fxStrength')); i++) {
          const sprite = this.sprite(stage.id, used++, node);
          sprite.visible = true;
          sprite.texture = this.softTexture(value('fxSoftness'));
          sprite.position.set(0, 0);
          sprite.tint = animationColor(value);
          sprite.alpha = Math.min(1, value('fxStrength') - i);
          sprite.width = sprite.height = value('fxRadius') * 2;
        }
      } else {
        let ring = this.rings.get(stage.id);
        if (!ring) {
          ring = new Graphics();
          node.addChild(ring);
          this.rings.set(stage.id, ring);
        }
        ring
          .clear()
          .circle(0, 0, value('fxRadius'))
          .stroke({
            width: value('fxSoftness'),
            color: animationColor(value),
            alpha: Math.min(1, value('fxStrength')),
          });
      }
      const pool = this.pools.get(stage.id);
      if (pool) for (let i = used; i < pool.length; i++) pool[i]!.visible = false;
    }
  }
  applyFilters(
    config: BuildingAnimationConfig,
    progress: number,
    container: Container,
    targetFor: (id: string) => Container | undefined,
  ): void {
    for (const stage of this.ordered) {
      if (
        stage.kind !== 'filter' ||
        !animationStageVisible(stage, progress) ||
        !animationResourceEnabled(config, stage)
      )
        continue;
      const target = targetFor(stage.parentId!),
        filter = this.filters.get(stage.id)?.filter;
      if (!target?.visible || !filter) continue;
      const sample = animationStageSampler(config, stage),
        value = (property: Parameters<typeof sample>[0]) => sample(property, progress),
        uniforms = filter.values.uniforms;
      const mix = value('opacity');
      const visualOpacity =
        stage.filterType === 'glow' ? Math.min(1, Math.max(0, value('fxVisualOpacity'))) : 1;
      if (
        mix <= 0 ||
        visualOpacity <= 0 ||
        (stage.filterType !== 'color' && value('fxStrength') === 0)
      )
        continue;
      const matrix =
        stage.coordinateSpace === 'local'
          ? resourceMatrix(config, stage.parentId!, progress)
          : { a: 1, b: 0, c: 0, d: 1 };
      const zero = container.toGlobal({ x: 0, y: 0 }),
        xAxis = container.toGlobal({ x: matrix.a, y: matrix.b }),
        yAxis = container.toGlobal({ x: matrix.c, y: matrix.d });
      const a = xAxis.x - zero.x,
        b = xAxis.y - zero.y,
        c = yAxis.x - zero.x,
        d = yAxis.y - zero.y,
        det = a * d - b * c;
      if (Math.abs(det) < 1e-8) continue;
      uniforms.uBasis.set([a, b, c, d]);
      uniforms.uMetric.set([d / det, -b / det, -c / det, a / det]);
      const pixelScale = Math.max(Math.hypot(a, b), Math.hypot(c, d));
      const point = effectOrigin(config, stage, progress),
        screen = container.toGlobal({ x: point.x - config.origin.x, y: point.y - config.origin.y });
      filter.origin.position.set(screen.x, screen.y);
      uniforms.uMix = mix;
      uniforms.uVisualOpacity = visualOpacity;
      uniforms.uTime = Math.max(
        0,
        (progress - (stage.emissionStart ?? stage.inPoint)) * config.timeline.durationSeconds,
      );
      const strength = value('fxStrength');
      const radius = value('fxRadius') * (stage.filterType === 'blur' ? strength : 1);
      uniforms.uParams.set([
        radius,
        strength,
        value('fxWaveLength'),
        stage.filterType === 'ripple' ? value('fxSpeed') : value('fxFrequency'),
      ]);
      uniforms.uAdjust.set([
        value('fxBrightness'),
        value('fxContrast'),
        value('fxSaturation'),
        (value('fxHue') * Math.PI) / 180,
      ]);
      const color = animationColor(value);
      uniforms.uColor.set([(color >> 16) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255]);
      filter.padding = Math.ceil(
        (stage.filterType === 'glow' ||
        stage.filterType === 'outline' ||
        stage.filterType === 'blur'
          ? radius
          : Math.abs(strength)) * pixelScale,
      );
      target.filters = [...(target.filters ?? []), filter];
    }
    // Intermediate passes render into a clear texture. Only the final pass composites
    // into the scene and must retain the resource's Add/Screen/etc. blend mode.
    for (const stage of config.stages) {
      if (stage.kind === 'filter') continue;
      const target = targetFor(stage.id);
      const filters = target?.filters;
      if (!target || !filters) continue;
      filters.forEach((filter, index) => {
        filter.blendMode = index === filters.length - 1 ? target.blendMode : 'normal';
      });
    }
  }
  destroy(): void {
    for (const node of this.generators.values()) node.destroy({ children: true });
    for (const { filter } of this.filters.values()) filter.destroy();
    this.setTextures(new Map());
    for (const texture of this.radial.values()) texture.destroy(true);
    this.generators.clear();
    this.filters.clear();
    this.radial.clear();
    this.plans.clear();
    this.pools.clear();
    this.rings.clear();
  }
}
