import {
  BlurFilter,
  defaultFilterVert,
  Filter,
  GlProgram,
  Matrix,
  Texture,
  TexturePool,
  type Sprite,
} from 'pixi.js';
import {
  maxTerrainLights,
  terrainLightsForBounds,
  type TerrainLightingSettings,
} from '../rendering/TerrainLightingSettings';
import type { BuildingLightPlacement } from './BuildingAnimationLights';

/** Image normals are sampled in artwork UVs; light positions stay in world meters. */
export class BuildingNormalMapFilter extends Filter {
  private mapMatrix = new Matrix();
  private glowMask: Filter;
  private glowBlur = new BlurFilter({ strength: 6, quality: 3 });
  private glowComposite: Filter;
  private glowStrength = 0;

  constructor(
    private sprite: Sprite,
    texture: Texture,
  ) {
    super({
      glProgram: GlProgram.from({
        name: 'building-normal-map',
        vertex: defaultFilterVert,
        fragment: `
          precision highp float;
          in vec2 vTextureCoord;
          out vec4 finalColor;
          uniform sampler2D uTexture;
          uniform sampler2D uNormalMap;
          uniform mat3 uMapMatrix;
          uniform mat3 uWorldMatrix;
          uniform vec4 uNormalBasis;
          uniform vec4 uLights[${maxTerrainLights}];
          uniform vec4 uLightColors[${maxTerrainLights}];
          uniform int uLightCount;
          uniform float uNormalStrength;
          uniform float uAmbient;
          uniform float uBlendMode;
          uniform float uGlowMask;
          uniform float uGlowThreshold;
          uniform float uGlowSoftness;
          uniform vec3 uGlowTint;
          void main() {
            vec4 diffuse = texture(uTexture, vTextureCoord);
            vec2 uv = (uMapMatrix * vec3(vTextureCoord, 1.0)).xy;
            vec3 encoded = texture(uNormalMap, clamp(uv, 0.0, 1.0)).rgb * 2.0 - 1.0;
            // OpenGL normal maps have +Y upwards; the world has +Y downwards.
            vec2 tangent = vec2(encoded.x, -encoded.y) * uNormalStrength;
            vec2 oriented = vec2(
              dot(uNormalBasis.xy, tangent), dot(uNormalBasis.zw, tangent));
            vec3 normal = normalize(vec3(oriented, max(0.0001, encoded.z)));
            vec2 position = (uWorldMatrix * vec3(uv, 1.0)).xy;
            vec3 direct = vec3(0.0);
            for (int i = 0; i < ${maxTerrainLights}; i++) {
              if (i >= uLightCount) break;
              vec4 light = uLights[i];
              vec2 toLight = light.xy - position;
              float distanceToLight = length(toLight);
              if (distanceToLight >= light.z) continue;
              vec3 direction = normalize(vec3(toLight, max(0.1, light.z * 0.35)));
              float attenuation = 1.0 - smoothstep(0.0, light.z, distanceToLight);
              direct += uLightColors[i].rgb * light.w * attenuation * max(dot(normal, direction), 0.0);
            }
            if (uGlowMask > 0.5) {
              // Extract only direct normal-map illumination, never ambient or bright albedo.
              float brightness = max(max(direct.r, direct.g), direct.b);
              float gate = uGlowSoftness > 0.0
                ? smoothstep(uGlowThreshold, uGlowThreshold + uGlowSoftness, brightness)
                : step(uGlowThreshold, brightness);
              vec3 emission = direct / max(1.0, brightness) * uGlowTint * gate * diffuse.a;
              float maskAlpha = max(max(emission.r, emission.g), emission.b);
              finalColor = vec4(emission, maskAlpha);
              return;
            }
            // Unpremultiply for blending, then restore the original alpha.
            vec3 albedo = diffuse.rgb / max(0.0001, diffuse.a);
            vec3 ambient = albedo * uAmbient;
            vec3 color = uBlendMode < 0.5 ? albedo * (vec3(uAmbient) + direct)
              : uBlendMode < 1.5 ? ambient + direct
              : vec3(1.0) - (vec3(1.0) - ambient) * (vec3(1.0) - clamp(direct, 0.0, 1.0));
            finalColor = vec4(color * diffuse.a, diffuse.a);
          }
        `,
      }),
      resources: {
        normalUniforms: {
          uMapMatrix: { value: new Matrix(), type: 'mat3x3<f32>' },
          uWorldMatrix: { value: new Matrix(), type: 'mat3x3<f32>' },
          uNormalBasis: { value: new Float32Array([1, 0, 0, 1]), type: 'vec4<f32>' },
          uLights: {
            value: new Float32Array(maxTerrainLights * 4),
            type: 'vec4<f32>',
            size: maxTerrainLights,
          },
          uLightColors: {
            value: new Float32Array(maxTerrainLights * 4),
            type: 'vec4<f32>',
            size: maxTerrainLights,
          },
          uLightCount: { value: 0, type: 'i32' },
          uNormalStrength: { value: 1, type: 'f32' },
          uAmbient: { value: 1, type: 'f32' },
          uBlendMode: { value: 0, type: 'f32' },
          uGlowThreshold: { value: 0.65, type: 'f32' },
          uGlowSoftness: { value: 0.2, type: 'f32' },
          uGlowTint: { value: new Float32Array([1, 1, 1]), type: 'vec3<f32>' },
        },
        glowOutputUniforms: { uGlowMask: { value: 0, type: 'f32' } },
        uNormalMap: texture.source,
        uNormalSampler: texture.source.style,
      },
    });
    this.glowMask = new Filter({
      glProgram: this.glProgram,
      resources: {
        normalUniforms: this.resources.normalUniforms,
        glowOutputUniforms: { uGlowMask: { value: 1, type: 'f32' } },
        uNormalMap: texture.source,
        uNormalSampler: texture.source.style,
      },
    });
    this.glowComposite = new Filter({
      glProgram: GlProgram.from({
        name: 'building-normal-glow-composite',
        vertex: defaultFilterVert,
        fragment: `
          precision highp float;
          in vec2 vTextureCoord;
          out vec4 finalColor;
          uniform sampler2D uTexture;
          uniform sampler2D uGlowTexture;
          uniform float uGlowStrength;
          void main() {
            vec4 base = texture(uTexture, vTextureCoord);
            vec4 halo = texture(uGlowTexture, vTextureCoord) * uGlowStrength;
            // Retain the resource alpha while allowing the halo into transparent padding.
            finalColor = vec4(base.rgb + halo.rgb, max(base.a, min(1.0, halo.a)));
          }
        `,
      }),
      resources: {
        glowUniforms: { uGlowStrength: { value: 0, type: 'f32' } },
        uGlowTexture: Texture.EMPTY.source,
      },
    });
  }

  update(settings: TerrainLightingSettings, placement: BuildingLightPlacement): void {
    this.sprite.updateLocalTransform();
    const local = this.sprite.localTransform;
    const [sx, sy] = placement.scale;
    const a = local.a * sx,
      b = local.b * sy,
      c = local.c * sx,
      d = local.d * sy;
    const x = placement.position[0] + local.tx * sx;
    const y = placement.position[1] + local.ty * sy;
    const width = this.sprite.texture.orig.width,
      height = this.sprite.texture.orig.height;
    const uniforms = this.resources.normalUniforms.uniforms;
    uniforms.uWorldMatrix.set(a * width, b * width, c * height, d * height, x, y);
    const determinant = a * d - b * c;
    // Remove uniform scale from the inverse transpose while preserving skew and aspect.
    const scale = Math.sqrt(Math.abs(determinant));
    const factor = Math.abs(determinant) > 1e-12 ? scale / determinant : 0;
    uniforms.uNormalBasis.set([d * factor, -b * factor, -c * factor, a * factor]);
    const corners = [
      [x, y],
      [x + a * width, y + b * width],
      [x + c * height, y + d * height],
      [x + a * width + c * height, y + b * width + d * height],
    ];
    const minX = Math.min(...corners.map(([px]) => px!));
    const minY = Math.min(...corners.map(([, py]) => py!));
    const maxX = Math.max(...corners.map(([px]) => px!));
    const maxY = Math.max(...corners.map(([, py]) => py!));
    const lights = terrainLightsForBounds(
      settings.lights,
      [minX, minY],
      [maxX - minX, maxY - minY],
    );
    uniforms.uLights.fill(0);
    uniforms.uLightColors.fill(0);
    lights.forEach((light, index) => {
      uniforms.uLights.set([...light.position, light.radius, light.intensity], index * 4);
      uniforms.uLightColors.set(
        [
          ((light.color >> 16) & 255) / 255,
          ((light.color >> 8) & 255) / 255,
          (light.color & 255) / 255,
          1,
        ],
        index * 4,
      );
    });
    uniforms.uLightCount = lights.length;
    uniforms.uNormalStrength = settings.normalStrength;
    uniforms.uAmbient = settings.ambient;
    uniforms.uBlendMode =
      settings.blendMode === 'multiply' ? 0 : settings.blendMode === 'add' ? 1 : 2;
    const glow = settings.normalGlow;
    this.glowStrength =
      settings.enabled && glow?.enabled && glow.radius > 0 && lights.length > 0
        ? glow.strength * glow.opacity
        : 0;
    this.glowBlur.strength = glow?.radius ?? 0;
    this.padding = this.glowStrength > 0 ? Math.ceil(this.glowBlur.padding) : 0;
    uniforms.uGlowThreshold = glow?.threshold ?? 0.65;
    uniforms.uGlowSoftness = glow?.softness ?? 0.2;
    const tint = glow?.color ?? 0xffffff;
    uniforms.uGlowTint.set([
      ((tint >> 16) & 255) / 255,
      ((tint >> 8) & 255) / 255,
      (tint & 255) / 255,
    ]);
    this.glowComposite.resources.glowUniforms.uniforms.uGlowStrength = this.glowStrength;
  }

  override apply(...args: Parameters<Filter['apply']>): void {
    const [manager, input, output, clear] = args;
    this.resources.normalUniforms.uniforms.uMapMatrix = manager.calculateSpriteMatrix(
      this.mapMatrix,
      this.sprite,
    );
    if (this.glowStrength <= 0) {
      manager.applyFilter(this, input, output, clear);
      return;
    }
    const lit = TexturePool.getSameSizeTexture(input);
    const mask = TexturePool.getSameSizeTexture(input);
    const halo = TexturePool.getSameSizeTexture(input);
    const blendMode = this.blendMode;
    try {
      // Only the final pass inherits the resource blend mode; intermediates use normal.
      this.blendMode = 'normal';
      manager.applyFilter(this, input, lit, true);
      manager.applyFilter(this.glowMask, input, mask, true);
      this.glowBlur.apply(manager, mask, halo, true);
      this.glowComposite.resources.uGlowTexture = halo.source;
      this.glowComposite.blendMode = blendMode;
      manager.applyFilter(this.glowComposite, lit, output, clear);
    } finally {
      this.blendMode = blendMode;
      this.glowComposite.resources.uGlowTexture = Texture.EMPTY.source;
      TexturePool.returnTexture(halo);
      TexturePool.returnTexture(mask);
      TexturePool.returnTexture(lit);
    }
  }

  override destroy(): void {
    this.glowMask.destroy();
    this.glowBlur.blurXFilter.destroy();
    this.glowBlur.blurYFilter.destroy();
    this.glowBlur.destroy();
    this.glowComposite.destroy();
    super.destroy();
  }
}
