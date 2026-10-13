import {
  Assets,
  Container,
  Filter,
  GlProgram,
  Graphics,
  Sprite,
  Texture,
  UniformGroup,
  type Renderer,
} from 'pixi.js';
import type {
  BuildingAnimationBlendMode,
  BuildingAnimationConfig,
  BuildingAnimationTransition,
  BuildingAnimationTrackProperty,
} from './BuildingAnimationConfig';
import { defaultTrackValue, sampleBuildingTrack } from './BuildingAnimationKeyframes';
import type { BuildingAnimationAssetStatus } from './BuildingAnimationPreview';
import {
  buildingTransitionDirections,
  sampleBuildingTransition,
  type TransitionPose,
} from './BuildingAnimationTransitions';
import { buildingTransitionVertex, buildingTransitionFragment } from './BuildingTransitionShader';
import { animationTextureAssets, isImageStage } from './BuildingAnimationEffects';
import { animationResourceEnabled } from './BuildingAnimationTransform';
import { BuildingAnimationEffectRenderer } from './BuildingAnimationEffectRenderer';
import {
  sampleBuildingAnimationLights,
  type BuildingLightPlacement,
} from './BuildingAnimationLights';
import { BuildingGlowMasks } from './BuildingGlowMasks';
import { BuildingNormalMapFilter } from './BuildingNormalMapFilter';
import type { TerrainLightingSettings } from '../rendering/TerrainLightingSettings';

export type BuildingTextureResolver = (assetId: string) => string | Texture | Promise<Texture>;

const edgeBlendIndex: Record<BuildingAnimationBlendMode, number> = {
  normal: 0,
  add: 1,
  screen: 2,
  multiply: 3,
  overlay: 4,
};

const hexRgb = (value: string) => {
  const numeric = Number.parseInt(value.slice(1), 16);
  return new Float32Array([
    ((numeric >> 16) & 255) / 255,
    ((numeric >> 8) & 255) / 255,
    (numeric & 255) / 255,
  ]);
};

const loadBlobTexture = (url: string): Promise<Texture> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(Texture.from(image, true));
    image.onerror = () => reject(new Error('Unable to decode local PNG stage.'));
    image.src = url;
  });

const degreesToRadians = (degrees: number) => (degrees * Math.PI) / 180;

function createTransitionFilter() {
  const uniforms = new UniformGroup({
    uEffect: { value: 0, type: 'f32' },
    uIncoming: { value: 1, type: 'f32' },
    uProgress: { value: 0, type: 'f32' },
    uNoiseScale: { value: 8, type: 'f32' },
    uDirectionStrength: { value: 0.68, type: 'f32' },
    uDirection: { value: 1, type: 'f32' },
    uEdgeWidth: { value: 0.08, type: 'f32' },
    uEdgeIntensity: { value: 1, type: 'f32' },
    uEdgeColor: { value: hexRgb('#85d7e8'), type: 'vec3<f32>' },
    uEdgeBlendMode: { value: 0, type: 'f32' },
    uSoftness: { value: 0.03, type: 'f32' },
    uStrength: { value: 0.5, type: 'f32' },
    uSegments: { value: 12, type: 'f32' },
    uAngle: { value: 0, type: 'f32' },
    uCenter: { value: new Float32Array([0.5, 0.5]), type: 'vec2<f32>' },
    uSeed: { value: 0, type: 'f32' },
    uReverse: { value: 0, type: 'f32' },
    uAspect: { value: 1, type: 'f32' },
  });
  const filter = new Filter({
    glProgram: GlProgram.from({
      vertex: buildingTransitionVertex,
      fragment: buildingTransitionFragment,
      name: 'building-transition',
    }),
    resources: { transitionUniforms: uniforms },
    antialias: 'inherit',
  });
  return { filter, uniforms };
}

export class BuildingAnimationPlayer {
  readonly container = new Container();
  private config: BuildingAnimationConfig;
  private sprites = new Map<string, Sprite>();
  private effects = new BuildingAnimationEffectRenderer();
  private glowMasks = new BuildingGlowMasks();
  private loadRevision = 0;
  private progress = 0;
  private hitbox = new Graphics();
  private incomingTransition = createTransitionFilter();
  private outgoingTransition = createTransitionFilter();
  private ownedTextures = new Set<Texture>();
  private assetTextures = new Map<string, Texture>();
  private normalFilters = new Map<string, BuildingNormalMapFilter>();
  private ghost = new Sprite();
  private onionStageIndex: number | null = null;
  private disposed = false;
  private onAssets?: (status: BuildingAnimationAssetStatus) => void;

  constructor(options: {
    config: BuildingAnimationConfig;
    resolveTexture?: BuildingTextureResolver;
    onAssets?: (status: BuildingAnimationAssetStatus) => void;
  }) {
    this.config = structuredClone(options.config);
    this.effects.sync(this.config);
    this.onAssets = options.onAssets;
    this.ghost.visible = false;
    this.container.addChild(this.ghost, this.hitbox);
    void this.loadTextures(options.resolveTexture);
  }

  async setConfig(
    config: BuildingAnimationConfig,
    resolveTexture?: BuildingTextureResolver,
    reloadTextures = false,
  ) {
    if (this.disposed) return;
    const optimizationChanged =
      JSON.stringify(this.config.textureOptimization) !==
      JSON.stringify(config.textureOptimization);
    const assetIdsChanged =
      JSON.stringify([
        animationTextureAssets(this.config),
        this.config.stages
          .filter(isImageStage)
          .map((stage) => [stage.id, stage.assetId, stage.normalMapAssetId]),
      ]) !==
      JSON.stringify([
        animationTextureAssets(config),
        config.stages
          .filter(isImageStage)
          .map((stage) => [stage.id, stage.assetId, stage.normalMapAssetId]),
      ]);
    this.config = structuredClone(config);
    this.effects.sync(this.config);
    if (assetIdsChanged || reloadTextures) await this.loadTextures(resolveTexture);
    else {
      this.arrangeSprites();
      if (optimizationChanged) this.applyTextureOptimization();
    }
    if (this.disposed) return;
    this.drawHitbox();
    this.setProgress(this.progress);
  }

  private applyTextureOptimization(): void {
    const optimization = this.config.textureOptimization;
    for (const texture of this.assetTextures.values()) {
      const source = texture.source;
      source.scaleMode = optimization.scaleMode;
      source.mipmapFilter = optimization.scaleMode;
      source.autoGenerateMipmaps = optimization.mipmaps;
      source.maxAnisotropy = optimization.anisotropy;
      source.update();
    }
  }

  private arrangeSprites(): void {
    for (const sprite of [...this.sprites.values(), ...this.effects.generators.values()])
      if (sprite.parent === this.container) this.container.removeChild(sprite);
    for (const stage of [...this.config.stages].sort(
      (left, right) => right.layerOrder - left.layerOrder,
    )) {
      const sprite = this.sprites.get(stage.id) ?? this.effects.generators.get(stage.id);
      if (sprite)
        this.container.addChildAt(sprite, Math.max(0, this.container.children.length - 1));
    }
    this.container.setChildIndex(this.ghost, this.container.children.length - 2);
  }

  private drawHitbox(): void {
    const hitbox = this.config.hitbox;
    const width = hitbox.width * hitbox.scaleX;
    const height = hitbox.height * hitbox.scaleY;
    const x = hitbox.x + (hitbox.width - width) / 2 - this.config.origin.x;
    const y = hitbox.y + (hitbox.height - height) / 2 - this.config.origin.y;
    this.hitbox
      .clear()
      .rect(x, y, width, height)
      .fill({ color: 0xed85ac, alpha: 0.08 })
      .stroke({ color: 0xed85ac, alpha: 0.9, width: 2 });
  }

  private async loadTextures(resolveTexture?: BuildingTextureResolver) {
    const revision = ++this.loadRevision;
    const stages = this.config.stages.filter(isImageStage);
    const assetIds = animationTextureAssets(this.config);
    this.onAssets?.({ loading: true, loaded: [], failed: [] });
    this.ghost.visible = false;
    this.ghost.texture = Texture.EMPTY;
    const results = await Promise.all(
      assetIds.map(async (assetId) => {
        try {
          const resolved = resolveTexture?.(assetId) ?? assetId;
          const owned = typeof resolved === 'string' && resolved.startsWith('blob:');
          const texture =
            typeof resolved === 'string'
              ? owned
                ? await loadBlobTexture(resolved)
                : await Assets.load<Texture>(resolved)
              : await resolved;
          if (!texture?.isTexture) return null;
          return { id: assetId, texture, owned };
        } catch {
          return null;
        }
      }),
    );
    if (revision !== this.loadRevision || this.disposed) {
      for (const result of results) if (result?.owned) result.texture.destroy(true);
      return;
    }
    for (const filter of this.normalFilters.values()) filter.destroy();
    this.normalFilters.clear();
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.effects.setTextures(new Map());
    this.assetTextures.clear();
    for (const texture of this.ownedTextures) texture.destroy(true);
    this.ownedTextures.clear();
    this.sprites.clear();
    for (const result of results) {
      if (!result) continue;
      if (result.owned) this.ownedTextures.add(result.texture);
      for (const stage of stages)
        if (stage.assetId === result.id) this.sprites.set(stage.id, new Sprite(result.texture));
    }
    this.assetTextures = new Map(
      results.flatMap((result) => (result ? [[result.id, result.texture] as const] : [])),
    );
    this.effects.setTextures(this.assetTextures);
    for (const stage of stages) {
      const sprite = this.sprites.get(stage.id);
      const normal = stage.normalMapAssetId
        ? this.assetTextures.get(stage.normalMapAssetId)
        : undefined;
      if (sprite && normal)
        this.normalFilters.set(stage.id, new BuildingNormalMapFilter(sprite, normal));
    }
    this.arrangeSprites();
    this.applyTextureOptimization();
    this.drawHitbox();
    this.setProgress(this.progress);
    this.onAssets?.({
      loading: false,
      loaded: assetIds.filter((_, index) => results[index] !== null),
      failed: assetIds.filter((_, index) => results[index] === null),
    });
  }

  private transitionFor(index: number): BuildingAnimationTransition | undefined {
    const stages = this.config.stages.filter(isImageStage);
    const from = stages[index];
    const to = stages[index + 1];
    return this.config.transitions.find(
      (transition) => transition.fromStageId === from?.id && transition.toStageId === to?.id,
    );
  }

  getLightSources(placement: BuildingLightPlacement) {
    return this.disposed
      ? []
      : sampleBuildingAnimationLights(this.config, this.progress, placement);
  }

  setLighting(settings: TerrainLightingSettings, placement: BuildingLightPlacement): void {
    if (this.disposed) return;
    for (const [id, filter] of this.normalFilters) {
      const sprite = this.sprites.get(id);
      if (!sprite) continue;
      const others = (sprite.filters ?? []).filter((item) => item !== filter);
      if (settings.enabled && sprite.visible) {
        filter.update(settings, placement);
        sprite.filters = [filter, ...others];
      } else sprite.filters = others.length ? others : null;
      sprite.filters?.forEach((item, index, filters) => {
        item.blendMode = index === filters.length - 1 ? sprite.blendMode : 'normal';
      });
    }
  }

  getGlowSources(renderer: Renderer, placement: BuildingLightPlacement) {
    return this.disposed
      ? []
      : this.glowMasks.collect(
          renderer,
          this.config,
          this.progress,
          placement,
          (id) => this.sprites.get(id) ?? this.effects.generators.get(id),
        );
  }

  setProgress(progress: number): void {
    if (this.disposed) return;
    this.progress = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
    const stages = this.config.stages.filter(isImageStage);
    this.effects.draw(this.config, this.progress);
    const applyEffects = () =>
      this.effects.applyFilters(
        this.config,
        this.progress,
        this.container,
        (id) => this.sprites.get(id) ?? this.effects.generators.get(id),
      );
    if (!stages.length) {
      applyEffects();
      return;
    }
    let activeIndex = 0;
    for (let index = 0; index < stages.length; index++) {
      if (stages[index]!.milestone <= this.progress) activeIndex = index;
    }
    const active = stages[activeIndex]!;
    const next = stages[activeIndex + 1];
    const transition = next ? this.transitionFor(activeIndex) : undefined;
    const span = next ? Math.max(0.0001, next.milestone - active.milestone) : 1;
    const local = next ? (this.progress - active.milestone) / span : 1;
    const sampled = transition ? sampleBuildingTransition(transition, local) : undefined;

    for (const stage of stages) {
      const sprite = this.sprites.get(stage.id);
      if (!sprite) continue;
      const sample = (property: BuildingAnimationTrackProperty) =>
        sampleBuildingTrack(
          this.config.tracks.find(
            (track) => track.stageId === stage.id && track.property === property,
          ),
          this.progress,
          defaultTrackValue(stage, property),
        );
      sprite.position.set(sample('x') - this.config.origin.x, sample('y') - this.config.origin.y);
      sprite.scale.set(sample('scaleX'), sample('scaleY'));
      sprite.rotation = degreesToRadians(sample('rotation'));
      sprite.skew.set(degreesToRadians(sample('skewX')), degreesToRadians(sample('skewY')));
      sprite.pivot.set(sample('pivotX'), sample('pivotY'));
      sprite.visible =
        animationResourceEnabled(this.config, stage) &&
        this.progress >= stage.inPoint &&
        (this.progress < stage.outPoint || (this.progress === 1 && stage.outPoint === 1));
      sprite.alpha = sample('opacity');
      sprite.mask = null;
      sprite.filters = null;
      sprite.tint = 0xffffff;
      sprite.blendMode = stage.blendMode ?? 'normal';
    }
    this.updateOnionSkin();
    const currentSprite = this.sprites.get(active.id);
    const nextSprite = next ? this.sprites.get(next.id) : undefined;
    if (!transition || !sampled || !nextSprite) {
      applyEffects();
      return;
    }
    const apply = (sprite: Sprite, pose: TransitionPose, incoming: boolean) => {
      sprite.alpha *= pose.opacity;
      if (pose.scaleX !== 1 || pose.scaleY !== 1 || pose.rotation !== 0) {
        // Compose with animated transforms while keeping the chosen canvas point fixed.
        const center = {
          x: this.config.canvas.width * transition.centerX,
          y: this.config.canvas.height * transition.centerY,
        };
        sprite.updateLocalTransform();
        const before = sprite.localTransform.apply(center);
        sprite.scale.x *= pose.scaleX;
        sprite.scale.y *= pose.scaleY;
        sprite.rotation += degreesToRadians(pose.rotation);
        sprite.updateLocalTransform();
        const after = sprite.localTransform.apply(center);
        sprite.position.x += before.x - after.x;
        sprite.position.y += before.y - after.y;
      }
      sprite.position.x += pose.x * this.config.canvas.width;
      sprite.position.y += pose.y * this.config.canvas.height;
      if (!sampled.shader) return;
      const effect = incoming ? this.incomingTransition : this.outgoingTransition;
      const uniforms = effect.uniforms.uniforms;
      uniforms.uEffect = sampled.shader;
      uniforms.uIncoming = incoming ? 1 : 0;
      uniforms.uProgress = sampled.amount;
      uniforms.uNoiseScale = Math.max(1, transition.noiseScale);
      uniforms.uDirectionStrength = Math.min(1, Math.max(0, transition.directionStrength));
      uniforms.uDirection = buildingTransitionDirections.findIndex(
        (entry) => entry.id === transition.direction,
      );
      uniforms.uEdgeWidth = transition.edgeWidth;
      uniforms.uEdgeIntensity = transition.edgeIntensity;
      uniforms.uEdgeColor = hexRgb(transition.edgeColor);
      uniforms.uEdgeBlendMode = edgeBlendIndex[transition.blendMode];
      uniforms.uSoftness = transition.softness;
      uniforms.uStrength = transition.strength;
      uniforms.uSegments = transition.segments;
      uniforms.uAngle = degreesToRadians(transition.angle);
      uniforms.uCenter = new Float32Array([transition.centerX, transition.centerY]);
      uniforms.uSeed = transition.seed;
      uniforms.uReverse = transition.reverse ? 1 : 0;
      uniforms.uAspect = this.config.canvas.width / this.config.canvas.height;
      sprite.filters = [effect.filter];
    };
    if (currentSprite) apply(currentSprite, sampled.outgoing, false);
    apply(nextSprite, sampled.incoming, true);
    applyEffects();
  }

  setOnionSkin(stageIndex: number | null): void {
    if (this.disposed || stageIndex === this.onionStageIndex) return;
    this.onionStageIndex = stageIndex;
    this.updateOnionSkin();
  }

  private updateOnionSkin(): void {
    const sprite =
      this.onionStageIndex === null
        ? undefined
        : this.sprites.get(this.config.stages[this.onionStageIndex]?.id ?? '');
    this.ghost.visible = !!sprite;
    if (!sprite) return;
    this.ghost.texture = sprite.texture;
    this.ghost.position.copyFrom(sprite.position);
    this.ghost.scale.copyFrom(sprite.scale);
    this.ghost.skew.copyFrom(sprite.skew);
    this.ghost.pivot.copyFrom(sprite.pivot);
    this.ghost.rotation = sprite.rotation;
    this.ghost.alpha = 0.18;
    this.ghost.tint = 0x85d7e8;
  }

  setHitboxVisible(visible: boolean): void {
    if (this.disposed) return;
    this.hitbox.visible = visible;
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loadRevision++;
    this.incomingTransition.filter.destroy();
    this.outgoingTransition.filter.destroy();
    this.glowMasks.destroy();
    for (const filter of this.normalFilters.values()) filter.destroy();
    this.normalFilters.clear();
    this.effects.destroy();
    this.container.destroy({ children: true });
    for (const texture of this.ownedTextures) texture.destroy(true);
    this.ownedTextures.clear();
    this.sprites.clear();
    this.assetTextures.clear();
  }
}
