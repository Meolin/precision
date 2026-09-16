import { defaultFilterVert, Filter, GlProgram, Matrix, type Sprite, type Texture } from 'pixi.js';
import { ShockwaveFilter } from 'pixi-filters';
import type { Vec2 } from '../math/Vec2';

/** Simple ambient + light-map shading, sampled in world space after camera clipping. */
export class WorldLightmapFilter extends Filter {
  private mapMatrix = new Matrix();

  constructor(
    texture: Texture,
    private mapSprite: Sprite,
  ) {
    super({
      glProgram: GlProgram.from({
        name: 'world-lightmap',
        vertex: defaultFilterVert,
        fragment: `
          precision highp float;
          in vec2 vTextureCoord;
          out vec4 finalColor;
          uniform sampler2D uTexture;
          uniform sampler2D uMapTexture;
          uniform mat3 uMapMatrix;
          uniform float uAmbient;
          void main() {
            vec4 diffuse = texture(uTexture, vTextureCoord);
            vec2 uv = (uMapMatrix * vec3(vTextureCoord, 1.0)).xy;
            vec3 light = texture(uMapTexture, clamp(uv, 0.0, 1.0)).rgb;
            finalColor = vec4(diffuse.rgb * (vec3(uAmbient) + light), diffuse.a);
          }
        `,
      }),
      resources: {
        lightmapUniforms: {
          uMapMatrix: { value: new Matrix(), type: 'mat3x3<f32>' },
          uAmbient: { value: 0, type: 'f32' },
        },
        uMapTexture: texture.source,
        uMapSampler: texture.source.style,
      },
    });
  }

  set alpha(value: number) {
    this.resources.lightmapUniforms.uniforms.uAmbient = value;
  }

  override apply(...args: Parameters<Filter['apply']>): void {
    const [manager, input, output, clear] = args;
    this.resources.lightmapUniforms.uniforms.uMapMatrix = manager.calculateSpriteMatrix(
      this.mapMatrix,
      this.mapSprite,
    );
    manager.applyFilter(this, input, output, clear);
  }
}

/** Convert a world-map UV to the actual (clipped, padded) filter input pixels. */
export class WorldShockwaveFilter extends ShockwaveFilter {
  mapPosition: Vec2 = { x: 0, y: 0 };
  private mapMatrix = new Matrix();

  constructor(private mapSprite: Sprite) {
    super();
  }

  override apply(...args: Parameters<ShockwaveFilter['apply']>): void {
    const [manager, input] = args;
    const point = manager
      .calculateSpriteMatrix(this.mapMatrix, this.mapSprite)
      .applyInverse(this.mapPosition);
    this.center = { x: point.x * input.source.width, y: point.y * input.source.height };
    super.apply(...args);
  }
}
