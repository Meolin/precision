import {
  Assets,
  Container,
  Filter,
  GlProgram,
  Graphics,
  Sprite,
  Texture,
  UniformGroup,
} from 'pixi.js';
import type {
  BuildingAnimationBlendMode,
  BuildingAnimationConfig,
  BuildingAnimationEasing,
  BuildingAnimationTransition,
  BuildingAnimationTrackProperty,
  DissolveDirection,
} from './BuildingAnimationConfig';
import { defaultTrackValue, sampleBuildingTrack } from './BuildingAnimationKeyframes';

export type BuildingTextureResolver = (assetId: string) => string | Texture | Promise<Texture>;

const vertex = `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}`;

const fragment = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uProgress;
uniform float uNoiseScale;
uniform float uDirectionStrength;
uniform float uDirection;
uniform float uEdgeWidth;
uniform float uEdgeIntensity;
uniform vec3 uEdgeColor;
uniform float uEdgeBlendMode;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float valueNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main(void) {
  vec4 source = texture(uTexture, vTextureCoord);
  float directional = 0.5;
  if (uDirection < 1.5 && uDirection > 0.5) directional = 1.0 - vTextureCoord.y;
  else if (uDirection < 2.5 && uDirection > 1.5) directional = vTextureCoord.y;
  else if (uDirection > 2.5) directional = abs(vTextureCoord.y - 0.5) * 2.0;
  float noiseValue = valueNoise(vTextureCoord * max(1.0, uNoiseScale));
  float threshold = mix(noiseValue, directional, clamp(uDirectionStrength, 0.0, 1.0));
  float shown = step(threshold, uProgress);
  float edge = (1.0 - smoothstep(0.0, max(0.001, uEdgeWidth), abs(threshold - uProgress))) * uEdgeIntensity;
  float edgeAmount = clamp(edge, 0.0, 1.0);
  float alpha = source.a * max(shown, edgeAmount);
  vec3 base = source.a > 0.0 ? source.rgb / source.a : vec3(0.0);
  vec3 effect = uEdgeColor;
  vec3 blended = effect;
  if (uEdgeBlendMode > 0.5 && uEdgeBlendMode < 1.5) blended = min(vec3(1.0), base + effect);
  else if (uEdgeBlendMode > 1.5 && uEdgeBlendMode < 2.5) blended = 1.0 - (1.0 - base) * (1.0 - effect);
  else if (uEdgeBlendMode > 2.5 && uEdgeBlendMode < 3.5) blended = base * effect;
  else if (uEdgeBlendMode > 3.5) {
    vec3 low = 2.0 * base * effect;
    vec3 high = 1.0 - 2.0 * (1.0 - base) * (1.0 - effect);
    blended = mix(low, high, step(vec3(0.5), base));
  }
  vec3 rgb = mix(base, blended, edgeAmount);
  finalColor = vec4(rgb * alpha, alpha);
}`;

const directionIndex: Record<DissolveDirection, number> = {
  uniform: 0,
  'bottom-to-top': 1,
  'top-to-bottom': 2,
  'center-out': 3,
};

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

const ease = (value: number, easing: BuildingAnimationEasing) => {
  if (easing === 'ease-in') return value * value * value;
  if (easing === 'ease-out') return 1 - Math.pow(1 - value, 3);
  if (easing === 'ease-in-out')
    return value < 0.5 ? 4 * value ** 3 : 1 - Math.pow(-2 * value + 2, 3) / 2;
  return value;
};

const degreesToRadians = (degrees: number) => (degrees * Math.PI) / 180;

function createDissolveFilter() {
  const uniforms = new UniformGroup({
    uProgress: { value: 0, type: 'f32' },
    uNoiseScale: { value: 8, type: 'f32' },
    uDirectionStrength: { value: 0.68, type: 'f32' },
    uDirection: { value: 1, type: 'f32' },
    uEdgeWidth: { value: 0.08, type: 'f32' },
    uEdgeIntensity: { value: 1, type: 'f32' },
    uEdgeColor: { value: hexRgb('#85d7e8'), type: 'vec3<f32>' },
    uEdgeBlendMode: { value: 0, type: 'f32' },
  });
  const filter = new Filter({
    glProgram: GlProgram.from({ vertex, fragment, name: 'building-dissolve' }),
    resources: { dissolveUniforms: uniforms },
    antialias: 'inherit',
  });
  return { filter, uniforms };
}

export class BuildingAnimationPlayer {
  readonly container = new Container();
  private config: BuildingAnimationConfig;
  private sprites = new Map<string, Sprite>();
  private loadRevision = 0;
  private progress = 0;
  private revealMask = new Graphics();
  private hitbox = new Graphics();
  private dissolve = createDissolveFilter();
  private ownedTextures = new Set<Texture>();

  constructor(options: {
    config: BuildingAnimationConfig;
    resolveTexture?: BuildingTextureResolver;
  }) {
    this.config = structuredClone(options.config);
    this.container.addChild(this.revealMask, this.hitbox);
    void this.loadTextures(options.resolveTexture);
  }

  async setConfig(
    config: BuildingAnimationConfig,
    resolveTexture?: BuildingTextureResolver,
    reloadTextures = false,
  ) {
    const optimizationChanged =
      JSON.stringify(this.config.textureOptimization) !==
      JSON.stringify(config.textureOptimization);
    const assetIdsChanged =
      this.config.stages.map((stage) => stage.assetId).join('|') !==
      config.stages.map((stage) => stage.assetId).join('|');
    this.config = structuredClone(config);
    if (assetIdsChanged || reloadTextures) await this.loadTextures(resolveTexture);
    else {
      this.arrangeSprites();
      if (optimizationChanged) this.applyTextureOptimization();
    }
    this.drawHitbox();
    this.setProgress(this.progress);
  }

  private applyTextureOptimization(): void {
    const optimization = this.config.textureOptimization;
    for (const sprite of this.sprites.values()) {
      const source = sprite.texture.source;
      source.scaleMode = optimization.scaleMode;
      source.mipmapFilter = optimization.scaleMode;
      source.autoGenerateMipmaps = optimization.mipmaps;
      source.maxAnisotropy = optimization.anisotropy;
      source.update();
    }
  }

  private arrangeSprites(): void {
    for (const sprite of this.sprites.values())
      if (sprite.parent === this.container) this.container.removeChild(sprite);
    for (const stage of [...this.config.stages].sort(
      (left, right) => right.layerOrder - left.layerOrder,
    )) {
      const sprite = this.sprites.get(stage.id);
      if (sprite)
        this.container.addChildAt(sprite, Math.max(0, this.container.children.length - 1));
    }
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
    const results = await Promise.all(
      this.config.stages.map(async (stage) => {
        try {
          const resolved = resolveTexture?.(stage.assetId) ?? stage.assetId;
          const owned = typeof resolved === 'string' && resolved.startsWith('blob:');
          const texture =
            typeof resolved === 'string'
              ? owned
                ? await loadBlobTexture(resolved)
                : await Assets.load<Texture>(resolved)
              : await resolved;
          if (!texture?.isTexture) return null;
          return { id: stage.id, texture, owned };
        } catch {
          return null;
        }
      }),
    );
    if (revision !== this.loadRevision) {
      for (const result of results) if (result?.owned) result.texture.destroy(true);
      return;
    }
    for (const sprite of this.sprites.values()) sprite.destroy();
    for (const texture of this.ownedTextures) texture.destroy(true);
    this.ownedTextures.clear();
    this.sprites.clear();
    for (const result of results) {
      if (!result) continue;
      if (result.owned) this.ownedTextures.add(result.texture);
      const sprite = new Sprite(result.texture);
      this.sprites.set(result.id, sprite);
    }
    this.arrangeSprites();
    this.applyTextureOptimization();
    this.drawHitbox();
    this.setProgress(this.progress);
  }

  private transitionFor(index: number): BuildingAnimationTransition | undefined {
    const from = this.config.stages[index];
    const to = this.config.stages[index + 1];
    return this.config.transitions.find(
      (transition) => transition.fromStageId === from?.id && transition.toStageId === to?.id,
    );
  }

  setProgress(progress: number): void {
    this.progress = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
    const stages = this.config.stages;
    if (!stages.length) return;
    let activeIndex = 0;
    for (let index = 0; index < stages.length; index++) {
      if (stages[index]!.milestone <= this.progress) activeIndex = index;
    }
    const active = stages[activeIndex]!;
    const next = stages[activeIndex + 1];
    const transition = next ? this.transitionFor(activeIndex) : undefined;
    const span = next ? Math.max(0.0001, next.milestone - active.milestone) : 1;
    const local = next ? (this.progress - active.milestone) / span : 1;
    const amount = ease(Math.min(1, Math.max(0, local)), transition?.easing ?? 'linear');

    this.revealMask.clear();
    for (const [index, stage] of stages.entries()) {
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
        this.progress >= stage.inPoint &&
        (this.progress < stage.outPoint || (this.progress === 1 && stage.outPoint === 1));
      sprite.alpha = sample('opacity') * (index === activeIndex + 1 ? amount : 1);
      sprite.mask = null;
      sprite.filters = null;
      sprite.tint = 0xffffff;
      sprite.blendMode = 'normal';
    }
    const currentSprite = this.sprites.get(active.id);
    const nextSprite = next ? this.sprites.get(next.id) : undefined;
    if (!transition || !nextSprite) return;
    if (transition.type === 'crossfade') {
      if (currentSprite) currentSprite.alpha *= 1 - amount;
      return;
    }
    if (transition.type === 'reveal') {
      const width = this.config.canvas.width * amount;
      this.revealMask
        .rect(-this.config.origin.x, -this.config.origin.y, width, this.config.canvas.height)
        .fill(0xffffff);
      nextSprite.mask = this.revealMask;
      return;
    }
    const uniforms = this.dissolve.uniforms.uniforms;
    uniforms.uProgress = amount;
    uniforms.uNoiseScale = transition.noiseScale;
    uniforms.uDirectionStrength = transition.directionStrength;
    uniforms.uDirection = directionIndex[transition.direction];
    uniforms.uEdgeWidth = transition.edgeWidth;
    uniforms.uEdgeIntensity = transition.edgeIntensity;
    uniforms.uEdgeColor = hexRgb(transition.edgeColor);
    uniforms.uEdgeBlendMode = edgeBlendIndex[transition.blendMode];
    nextSprite.filters = [this.dissolve.filter];
  }

  setOnionSkin(stageIndex: number | null): void {
    if (stageIndex === null) return this.setProgress(this.progress);
    const sprite = this.sprites.get(this.config.stages[stageIndex]?.id ?? '');
    if (sprite) {
      sprite.visible = true;
      sprite.alpha = 0.18;
      sprite.tint = 0x85d7e8;
    }
  }

  setHitboxVisible(visible: boolean): void {
    this.hitbox.visible = visible;
  }

  destroy(): void {
    this.loadRevision++;
    this.dissolve.filter.destroy();
    this.container.destroy({ children: true });
    for (const texture of this.ownedTextures) texture.destroy(true);
    this.ownedTextures.clear();
    this.sprites.clear();
  }
}
