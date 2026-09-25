import { GlProgram, Mesh, MeshGeometry, Shader, Texture, UniformGroup } from 'pixi.js';
import type { TerrainSmoothingSettings } from './TerrainSmoothingSettings';
import type { TerrainTextureOrientation } from './TerrainTextureSettings';
import { terrainMaterialVisuals, type TerrainVisualColor } from './terrainMaterialVisuals';
import { TerrainMaterialId } from '../terrain/TerrainMaterialId';
import {
  terrainFieldDistanceRangeCells,
  terrainFieldHaloCells,
  terrainFieldSurfaceDepthCells,
} from './terrainVisualField';

const vertex = `#version 300 es
in vec2 aPosition;
in vec2 aUV;
out vec2 vFieldUv;
out vec2 vWorldPosition;
out vec4 vColor;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform vec4 uWorldColorAlpha;
uniform mat3 uTransformMatrix;
uniform vec4 uColor;
uniform vec2 uChunkOrigin;
uniform vec2 uChunkSize;
uniform vec2 uFieldUvMin;
uniform vec2 uFieldUvMax;
void main(void) {
  mat3 matrix = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((matrix * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vFieldUv = mix(uFieldUvMin, uFieldUvMax, aUV);
  vWorldPosition = uChunkOrigin + aUV * uChunkSize;
  vColor = uWorldColorAlpha * uColor;
}`;

const fragment = `#version 300 es
in vec2 vFieldUv;
in vec2 vWorldPosition;
in vec4 vColor;
out vec4 finalColor;
uniform sampler2D uField;
uniform sampler2D uRockTexture;
uniform float uSmoothingEnabled;
uniform float uSmoothingQuality;
uniform vec2 uFieldTexelSize;
uniform float uTextureOrientation;
uniform vec2 uRockTileSize;
uniform float uRockOpacity;
uniform vec3 uSoilBody;
uniform vec3 uSoilSurface;
uniform vec3 uSoilEdge;
uniform vec3 uRockBody;
uniform vec3 uRockSurface;
uniform vec3 uRockEdge;

float tileHash(vec2 tile) {
  return fract(sin(dot(tile, vec2(127.1, 311.7))) * 43758.5453123);
}

vec2 textureCoordinate(vec2 scaled, inout vec2 gradientX, inout vec2 gradientY) {
  vec2 tile = floor(scaled);
  vec2 local = fract(scaled);
  bool mirrorX = false;
  bool mirrorY = false;
  float quarterTurns = 0.0;
  if (uTextureOrientation < 0.5) {
    mirrorX = mod(abs(tile.x), 2.0) >= 1.0;
    mirrorY = mod(abs(tile.y), 2.0) >= 1.0;
  } else if (uTextureOrientation < 2.5) {
    mirrorX = uTextureOrientation >= 1.5 && mod(abs(tile.x), 2.0) >= 1.0;
  } else {
    float hash = tileHash(tile);
    mirrorX = hash >= 0.5;
    mirrorY = fract(hash * 7.0) >= 0.5;
    quarterTurns = floor(fract(hash * 13.0) * 4.0);
    if (abs(uRockTileSize.x - uRockTileSize.y) > 0.001)
      quarterTurns = mod(quarterTurns, 2.0) * 2.0;
  }
  if (mirrorX) {
    local.x = 1.0 - local.x;
    gradientX.x = -gradientX.x;
    gradientY.x = -gradientY.x;
  }
  if (mirrorY) {
    local.y = 1.0 - local.y;
    gradientX.y = -gradientX.y;
    gradientY.y = -gradientY.y;
  }
  if (quarterTurns < 0.5) return local;
  if (quarterTurns < 1.5) {
    gradientX = vec2(-gradientX.y, gradientX.x);
    gradientY = vec2(-gradientY.y, gradientY.x);
    return vec2(1.0 - local.y, local.x);
  }
  if (quarterTurns < 2.5) {
    gradientX = -gradientX;
    gradientY = -gradientY;
    return vec2(1.0 - local.x, 1.0 - local.y);
  }
  gradientX = vec2(gradientX.y, -gradientX.x);
  gradientY = vec2(gradientY.y, -gradientY.x);
  return vec2(local.y, 1.0 - local.x);
}

// Bilinear reconstruction cannot overshoot the four neighbouring distances. Cubic weights
// can create detached solid specks around the one-cell remnants of a shallow terrain scrape.
float distanceCoverage(vec2 fieldUv) {
  return textureLod(uField, fieldUv, 0.0).r;
}

float edgeAlpha(vec2 fieldUv, float antialiasWidth) {
  float coverage = distanceCoverage(fieldUv);
  return smoothstep(0.5 - antialiasWidth, 0.5 + antialiasWidth, coverage);
}

vec3 shadedColor(vec3 body, vec3 surface, vec3 edge, float shade) {
  if (shade < 0.5) return mix(body, surface, shade * 2.0);
  return mix(surface, edge, (shade - 0.5) * 2.0);
}

void main(void) {
  vec4 field = texture(uField, vFieldUv);
  float centerCoverage = distanceCoverage(vFieldUv);
  // Derivatives must be evaluated before the early return and tile-dependent branches.
  vec2 fieldDx = dFdx(vFieldUv);
  vec2 fieldDy = dFdy(vFieldUv);
  float coverageDx = dFdx(centerCoverage);
  float coverageDy = dFdy(centerCoverage);
  vec2 continuousRockUv = vWorldPosition / max(uRockTileSize, vec2(0.001));
  vec2 rockDx = dFdx(continuousRockUv);
  vec2 rockDy = dFdy(continuousRockUv);
  // The field texture is opaque to preserve signed distances in air texels. R at each
  // texel centre retains the authoritative occupancy sign for the unsmoothed mode.
  ivec2 fieldCell = clamp(ivec2(floor(vFieldUv / uFieldTexelSize)),
    ivec2(0), textureSize(uField, 0) - ivec2(1));
  float alpha = step(0.5, texelFetch(uField, fieldCell, 0).r);
  if (uSmoothingEnabled > 0.5) {
    int grid = int(uSmoothingQuality);
    // Each sample integrates its subpixel footprint; quality does not change the contour.
    float antialiasWidth = max(0.5 * (abs(coverageDx) + abs(coverageDy)) / float(grid), 0.00001);
    alpha = 0.0;
    for (int y = 0; y < 16; y++) {
      if (y >= grid) break;
      for (int x = 0; x < 16; x++) {
        if (x >= grid) break;
        vec2 pixelOffset = (vec2(float(x), float(y)) + 0.5) / float(grid) - 0.5;
        vec2 fieldUv = clamp(vFieldUv + fieldDx * pixelOffset.x + fieldDy * pixelOffset.y,
          1.5 * uFieldTexelSize, vec2(1.0) - 1.5 * uFieldTexelSize);
        alpha += edgeAlpha(fieldUv, antialiasWidth);
      }
    }
    alpha /= float(grid * grid);
  }
  if (alpha <= 0.0) {
    finalColor = vec4(0.0);
    return;
  }

  // Surface lighting follows the same continuous contour, avoiding a cell-shaped bright rim.
  float shade = uSmoothingEnabled > 0.5
    ? clamp(1.0 - max(0.0, (centerCoverage - 0.5) * ${(2 * terrainFieldDistanceRangeCells).toFixed(1)}) / ${terrainFieldSurfaceDepthCells.toFixed(1)}, 0.0, 1.0)
    : field.b;
  vec3 soil = shadedColor(
    uSoilBody,
    uSoilSurface,
    uSoilEdge,
    shade
  );
  vec3 rockBase = shadedColor(
    uRockBody,
    uRockSurface,
    uRockEdge,
    shade
  );
  vec2 rockUv = textureCoordinate(continuousRockUv, rockDx, rockDy);
  vec3 rockTexture = textureGrad(uRockTexture, rockUv, rockDx, rockDy).rgb;
  vec3 rock = mix(rockBase, rockTexture, uRockOpacity);
  vec3 color = mix(soil, rock, field.g);
  float finalAlpha = alpha * vColor.a;
  finalColor = vec4(color * vColor.rgb * finalAlpha, finalAlpha);
}`;

let sharedProgram: GlProgram | null = null;

function program(): GlProgram {
  sharedProgram ??= GlProgram.from({
    name: 'terrain-chunk-material',
    vertex,
    fragment,
    preferredFragmentPrecision: 'highp',
  });
  return sharedProgram;
}

const orientationIndex: Readonly<Record<TerrainTextureOrientation, number>> = {
  mirrored: 0,
  sequential: 1,
  'mirror-x': 2,
  random: 3,
};

export function terrainTextureWorldSize(
  pixelWidth: number,
  pixelHeight: number,
  widthMeters = 19.2,
): readonly [widthMeters: number, heightMeters: number] {
  if (
    !Number.isFinite(pixelWidth) ||
    !Number.isFinite(pixelHeight) ||
    !Number.isFinite(widthMeters) ||
    pixelWidth <= 0 ||
    pixelHeight <= 0 ||
    widthMeters <= 0
  )
    throw new Error('Invalid terrain texture dimensions.');
  return [widthMeters, widthMeters * (pixelHeight / pixelWidth)];
}

export function terrainTextureOrientationIndex(orientation: TerrainTextureOrientation): number {
  return orientationIndex[orientation];
}

function normalizedColor(color: TerrainVisualColor): Float32Array {
  return new Float32Array(color.map((component) => component / 255));
}

export interface TerrainChunkMeshOptions {
  readonly fieldTexture: Texture;
  readonly rockTexture: Texture;
  readonly chunkOriginMeters: readonly [number, number];
  readonly chunkSizeMeters: readonly [number, number];
  readonly fieldSize: readonly [number, number];
  readonly smoothing: TerrainSmoothingSettings;
  readonly orientation: TerrainTextureOrientation;
}

/** One renderer-only rectangle sampling a compact terrain field and full-resolution materials. */
export class TerrainChunkMesh {
  readonly view: Mesh<MeshGeometry, Shader>;
  private readonly geometry: MeshGeometry;
  private readonly shader: Shader;
  private readonly uniforms: UniformGroup;
  private rockTexture: Texture;
  private smoothing: TerrainSmoothingSettings;
  private orientation: TerrainTextureOrientation;

  constructor(private readonly options: TerrainChunkMeshOptions) {
    const [width, height] = options.chunkSizeMeters;
    const [fieldWidth, fieldHeight] = options.fieldSize;
    this.geometry = new MeshGeometry({
      positions: new Float32Array([0, 0, width, 0, width, height, 0, height]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    const tileSize = terrainTextureWorldSize(
      options.rockTexture.source.pixelWidth,
      options.rockTexture.source.pixelHeight,
      terrainMaterialVisuals[TerrainMaterialId.Rock].texture?.tileWidthMeters,
    );
    const soil = terrainMaterialVisuals[TerrainMaterialId.Soil];
    const rock = terrainMaterialVisuals[TerrainMaterialId.Rock];
    this.uniforms = new UniformGroup({
      uChunkOrigin: {
        value: new Float32Array(options.chunkOriginMeters),
        type: 'vec2<f32>',
      },
      uChunkSize: { value: new Float32Array(options.chunkSizeMeters), type: 'vec2<f32>' },
      uFieldUvMin: {
        value: new Float32Array([
          terrainFieldHaloCells / fieldWidth,
          terrainFieldHaloCells / fieldHeight,
        ]),
        type: 'vec2<f32>',
      },
      uFieldUvMax: {
        value: new Float32Array([
          (fieldWidth - terrainFieldHaloCells) / fieldWidth,
          (fieldHeight - terrainFieldHaloCells) / fieldHeight,
        ]),
        type: 'vec2<f32>',
      },
      uSmoothingEnabled: { value: options.smoothing.enabled ? 1 : 0, type: 'f32' },
      uSmoothingQuality: { value: options.smoothing.quality, type: 'f32' },
      uFieldTexelSize: {
        value: new Float32Array([1 / fieldWidth, 1 / fieldHeight]),
        type: 'vec2<f32>',
      },
      uTextureOrientation: {
        value: terrainTextureOrientationIndex(options.orientation),
        type: 'f32',
      },
      uRockTileSize: { value: new Float32Array(tileSize), type: 'vec2<f32>' },
      uRockOpacity: {
        value: options.rockTexture === Texture.WHITE ? 0 : (rock.texture?.opacity ?? 0),
        type: 'f32',
      },
      uSoilBody: { value: normalizedColor(soil.body), type: 'vec3<f32>' },
      uSoilSurface: { value: normalizedColor(soil.surface), type: 'vec3<f32>' },
      uSoilEdge: { value: normalizedColor(soil.edge), type: 'vec3<f32>' },
      uRockBody: { value: normalizedColor(rock.body), type: 'vec3<f32>' },
      uRockSurface: { value: normalizedColor(rock.surface), type: 'vec3<f32>' },
      uRockEdge: { value: normalizedColor(rock.edge), type: 'vec3<f32>' },
    });
    this.rockTexture = options.rockTexture;
    this.smoothing = { ...options.smoothing };
    this.orientation = options.orientation;
    this.shader = new Shader({
      glProgram: program(),
      resources: {
        uField: options.fieldTexture.source,
        uFieldSampler: options.fieldTexture.source.style,
        uRockTexture: options.rockTexture.source,
        uRockSampler: options.rockTexture.source.style,
        terrainUniforms: this.uniforms,
      },
    });
    this.view = new Mesh({ geometry: this.geometry, shader: this.shader });
    this.view.position.set(options.chunkOriginMeters[0], options.chunkOriginMeters[1]);
    this.setSettings(options.smoothing, options.orientation);
  }

  setSettings(smoothing: TerrainSmoothingSettings, orientation: TerrainTextureOrientation): void {
    this.smoothing = { ...smoothing };
    this.orientation = orientation;
    this.options.fieldTexture.source.scaleMode = smoothing.enabled ? 'linear' : 'nearest';
    this.uniforms.uniforms.uSmoothingEnabled = smoothing.enabled ? 1 : 0;
    this.uniforms.uniforms.uSmoothingQuality = smoothing.quality;
    this.uniforms.uniforms.uTextureOrientation = terrainTextureOrientationIndex(orientation);
  }

  setRockTexture(texture: Texture): void {
    if (texture === this.rockTexture) return;
    this.rockTexture = texture;
    this.shader.resources.uRockTexture = texture.source;
    this.shader.resources.uRockSampler = texture.source.style;
    this.uniforms.uniforms.uRockTileSize = new Float32Array(
      terrainTextureWorldSize(
        texture.source.pixelWidth,
        texture.source.pixelHeight,
        terrainMaterialVisuals[TerrainMaterialId.Rock].texture?.tileWidthMeters,
      ),
    );
    this.uniforms.uniforms.uRockOpacity =
      texture === Texture.WHITE
        ? 0
        : (terrainMaterialVisuals[TerrainMaterialId.Rock].texture?.opacity ?? 0);
  }

  setDisplayRect(x: number, y: number, width: number, height: number): void {
    this.view.position.set(x, y);
    this.view.scale.set(
      width / this.options.chunkSizeMeters[0],
      height / this.options.chunkSizeMeters[1],
    );
  }

  /** Kept for callers that also update the camera; screen derivatives now set AA width. */
  setPixelsPerMeter(pixelsPerMeter: number): void {
    void pixelsPerMeter;
  }

  createInstance(): TerrainChunkMesh {
    const instance = new TerrainChunkMesh({
      ...this.options,
      rockTexture: this.rockTexture,
      smoothing: this.smoothing,
      orientation: this.orientation,
    });
    return instance;
  }

  syncMaterialFrom(source: TerrainChunkMesh): void {
    this.setRockTexture(source.rockTexture);
    this.setSettings(source.smoothing, source.orientation);
  }

  destroy(): void {
    this.view.destroy();
    this.geometry.destroy();
    this.shader.destroy();
  }
}
