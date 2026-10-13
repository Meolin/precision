import { GlProgram, Mesh, MeshGeometry, Shader, Texture, UniformGroup } from 'pixi.js';
import type { TerrainSmoothingSettings } from './TerrainSmoothingSettings';
import type { TerrainTextureFormat, TerrainTextureOrientation } from './TerrainTextureSettings';
import type { MaterialMaps } from './MaterialMaps';
import {
  maxTerrainLights,
  terrainLightsForBounds,
  type TerrainLightingSettings,
} from './TerrainLightingSettings';
import { maxTerrainGlowSources, terrainGlowsForBounds } from './TerrainGlowSource';
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
uniform sampler2D uSoilTexture;
uniform sampler2D uRockTexture;
uniform sampler2D uRockAlphaTexture;
uniform sampler2D uHeightMap;
uniform sampler2D uNormalMap;
uniform float uSmoothingEnabled;
uniform float uSmoothingQuality;
uniform vec2 uFieldTexelSize;
uniform float uTextureOrientation;
uniform float uDensityTiling;
uniform vec2 uRockTileSize;
uniform vec2 uSoilTileSize;
uniform float uRockOpacity;
uniform float uSoilOpacity;
uniform float uRockTextureFormat;
uniform float uRockAlphaReady;
uniform vec3 uSoilBody;
uniform vec3 uSoilSurface;
uniform vec3 uSoilEdge;
uniform vec3 uRockBody;
uniform vec3 uRockSurface;
uniform vec3 uRockEdge;
uniform vec4 uLights[${maxTerrainLights}];
uniform vec4 uLightColors[${maxTerrainLights}];
uniform int uLightCount;
${Array.from({ length: maxTerrainGlowSources }, (_, i) => `uniform sampler2D uGlowMask${i};`).join('\n')}
uniform int uGlowCount;
uniform vec4 uGlowMatrices[${maxTerrainGlowSources}];
uniform vec4 uGlowOffsets[${maxTerrainGlowSources}];
uniform vec4 uGlowBases[${maxTerrainGlowSources}];
uniform vec4 uGlowColors[${maxTerrainGlowSources}];
uniform vec4 uGlowParams[${maxTerrainGlowSources}];
uniform vec4 uGlowBounds[${maxTerrainGlowSources}];
uniform float uNormalStrength;
uniform float uAmbient;
uniform float uLightBlendMode;
uniform float uLightingEnabled;
uniform float uMaterialMapsReady;
uniform float uDisplayMode;

float glowAlpha(int index, vec2 point) {
  vec4 m = uGlowMatrices[index];
  vec2 uv = vec2(m.x * point.x + m.z * point.y, m.y * point.x + m.w * point.y) + uGlowOffsets[index].xy;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 0.0;
  ${Array.from({ length: maxTerrainGlowSources }, (_, i) => `if (index == ${i}) return textureLod(uGlowMask${i}, uv, 0.0).a;`).join('\n  ')}
  return 0.0;
}

float tileHash(vec2 tile) {
  if (uDensityTiling < 0.5)
    return fract(sin(dot(tile, vec2(127.1, 311.7))) * 43758.5453123);
  uvec2 coordinates = uvec2(ivec2(tile));
  uint value = coordinates.x * 374761393u + coordinates.y * 668265263u;
  value = (value ^ (value >> 13u)) * 1274126177u;
  return float((value ^ (value >> 16u)) & 65535u) / 65536.0;
}

vec2 textureCoordinate(vec2 scaled, inout vec2 gradientX, inout vec2 gradientY, out mat2 uvJacobian) {
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
  uvJacobian = mat2(mirrorX ? -1.0 : 1.0, 0.0, 0.0, mirrorY ? -1.0 : 1.0);
  if (quarterTurns < 0.5) return local;
  if (quarterTurns < 1.5) {
    uvJacobian = mat2(0.0, 1.0, -1.0, 0.0) * uvJacobian;
    gradientX = vec2(-gradientX.y, gradientX.x);
    gradientY = vec2(-gradientY.y, gradientY.x);
    return vec2(1.0 - local.y, local.x);
  }
  if (quarterTurns < 2.5) {
    uvJacobian = -uvJacobian;
    gradientX = -gradientX;
    gradientY = -gradientY;
    return vec2(1.0 - local.x, 1.0 - local.y);
  }
  uvJacobian = mat2(0.0, -1.0, 1.0, 0.0) * uvJacobian;
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
  vec2 continuousSoilUv = vWorldPosition / max(uSoilTileSize, vec2(0.001));
  vec2 rockDx = dFdx(continuousRockUv);
  vec2 rockDy = dFdy(continuousRockUv);
  vec2 soilDx = dFdx(continuousSoilUv);
  vec2 soilDy = dFdy(continuousSoilUv);
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
  vec3 soilBase = shadedColor(
    uSoilBody,
    uSoilSurface,
    uSoilEdge,
    shade
  );
  vec3 soilTexture = textureGrad(uSoilTexture, fract(continuousSoilUv), soilDx, soilDy).rgb;
  vec3 soil = mix(soilBase, soilTexture, uSoilOpacity);
  vec3 rockBase = shadedColor(
    uRockBody,
    uRockSurface,
    uRockEdge,
    shade
  );
  mat2 uvJacobian;
  vec2 rockUv = textureCoordinate(continuousRockUv, rockDx, rockDy, uvJacobian);
  vec2 rockAlbedoUv = rockUv;
  vec2 rockAlbedoDx = rockDx;
  vec2 rockAlbedoDy = rockDy;
  if (uRockTextureFormat > 0.5) {
    rockAlbedoUv.x *= 0.5;
    rockAlbedoDx.x *= 0.5;
    rockAlbedoDy.x *= 0.5;
  }
  vec3 rockTexture = textureGrad(uRockTexture, rockAlbedoUv, rockAlbedoDx, rockAlbedoDy).rgb;
  vec3 rock = mix(rockBase, rockTexture, uRockOpacity);
  float rockMix = field.g;
  if (uRockAlphaReady > 0.5) {
    float rockAbove = texture(uField, vFieldUv - vec2(0.0, uFieldTexelSize.y)).g;
    float upperEdge = smoothstep(0.01, 0.2, field.g - rockAbove) *
      (1.0 - smoothstep(0.96, 1.0, field.g));
    float alphaMask = textureGrad(uRockAlphaTexture, rockUv, rockDx, rockDy).r;
    rockMix = mix(field.g, field.g * alphaMask, upperEdge);
  }
  vec3 color = mix(soil, rock, rockMix);
  if (uDisplayMode > 0.5 && rockMix > 0.5) {
    if (uDisplayMode < 1.5) color = rockTexture;
    else if (uDisplayMode < 2.5) color = vec3(textureGrad(uHeightMap, rockUv, rockDx, rockDy).r);
    else color = textureGrad(uNormalMap, rockUv, rockDx, rockDy).rgb;
  } else if (uLightingEnabled > 0.5) {
    vec3 mapped = uMaterialMapsReady > 0.5
      ? textureGrad(uNormalMap, rockUv, rockDx, rockDy).rgb * 2.0 - 1.0
      : vec3(0.0, 0.0, 1.0);
    vec2 materialNormal = transpose(uvJacobian) * mapped.xy;
    vec2 contourGradient = vec2(
      texture(uField, vFieldUv + vec2(uFieldTexelSize.x, 0.0)).r -
      texture(uField, vFieldUv - vec2(uFieldTexelSize.x, 0.0)).r,
      texture(uField, vFieldUv + vec2(0.0, uFieldTexelSize.y)).r -
      texture(uField, vFieldUv - vec2(0.0, uFieldTexelSize.y)).r
    );
    // Occupancy distance rises into solid terrain; its negative gradient faces new air.
    float rim = 1.0 - smoothstep(0.0, 0.12, abs(centerCoverage - 0.5));
    vec2 contourNormal = -normalize(contourGradient + vec2(0.00001)) * rim;
    vec3 normal = normalize(vec3(materialNormal * uNormalStrength * rockMix + contourNormal * 0.85, 1.0));
    vec3 directLight = vec3(0.0);
    for (int i = 0; i < ${maxTerrainLights}; i++) {
      if (i >= uLightCount) break;
      vec4 light = uLights[i];
      vec2 toLight = light.xy - vWorldPosition;
      float distanceToLight = length(toLight);
      if (distanceToLight >= light.z) continue;
      vec3 lightDirection = normalize(vec3(toLight, max(0.1, light.z * 0.35)));
      float attenuation = 1.0 - smoothstep(0.0, light.z, distanceToLight);
      float diffuse = max(dot(normal, lightDirection), 0.0);
      directLight += uLightColors[i].rgb * (light.w * attenuation * diffuse);
    }
    for (int g = 0; g < ${maxTerrainGlowSources}; g++) {
      if (g >= uGlowCount) break;
      vec4 bounds = uGlowBounds[g];
      if (any(lessThan(vWorldPosition, bounds.xy)) || any(greaterThan(vWorldPosition, bounds.xy + bounds.zw))) continue;
      vec4 basis = uGlowBases[g];
      float sum = 0.0;
      vec3 directions = vec3(0.0);
      for (int ring = 1; ring <= 4; ring++) {
        for (int i = 0; i < 12; i++) {
          float angle = float(i) * 6.2831853 / 12.0;
          vec2 axis = vec2(cos(angle), sin(angle)) * float(ring) / 4.0;
          vec2 offset = vec2(basis.x * axis.x + basis.z * axis.y, basis.y * axis.x + basis.w * axis.y);
          float alpha = glowAlpha(g, vWorldPosition + offset);
          sum += alpha;
          directions += normalize(vec3(offset, uGlowParams[g].z)) * alpha;
        }
      }
      float halo = clamp(sum / 48.0 * uGlowParams[g].x * 2.0, 0.0, 1.0) *
        (1.0 - glowAlpha(g, vWorldPosition)) * uGlowParams[g].y;
      vec3 direction = normalize(directions + vec3(0.0, 0.0, 0.00001));
      directLight += uGlowColors[g].rgb * halo * max(dot(normal, direction), 0.0);
    }
    vec3 ambientColor = color * uAmbient;
    if (uLightBlendMode < 0.5) color = color * (vec3(uAmbient) + directLight);
    else if (uLightBlendMode < 1.5) color = ambientColor + directLight;
    else color = vec3(1.0) - (vec3(1.0) - clamp(ambientColor, 0.0, 1.0)) *
      (vec3(1.0) - clamp(directLight, 0.0, 1.0));
  }
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

export function terrainTextureFormatIndex(format: TerrainTextureFormat): number {
  return format === 'albedo-normal-horizontal' ? 1 : 0;
}

function normalizedColor(color: TerrainVisualColor): Float32Array {
  return new Float32Array(color.map((component) => component / 255));
}

export interface TerrainChunkMeshOptions {
  readonly fieldTexture: Texture;
  readonly soilTexture: Texture;
  readonly rockTexture: Texture;
  readonly rockAlphaTexture: Texture | null;
  readonly rockTextureFormat: TerrainTextureFormat;
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
  private soilTexture: Texture;
  private rockAlphaTexture: Texture | null;
  private rockTextureFormat: TerrainTextureFormat;
  private materialMaps: MaterialMaps | null = null;
  private lighting: TerrainLightingSettings | null = null;
  private smoothing: TerrainSmoothingSettings;
  private orientation: TerrainTextureOrientation;
  private densityTiling = false;

  constructor(private readonly options: TerrainChunkMeshOptions) {
    const [width, height] = options.chunkSizeMeters;
    const [fieldWidth, fieldHeight] = options.fieldSize;
    this.geometry = new MeshGeometry({
      positions: new Float32Array([0, 0, width, 0, width, height, 0, height]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    const rockPixelWidth =
      options.rockTexture.source.pixelWidth /
      (options.rockTextureFormat === 'albedo-normal-horizontal' ? 2 : 1);
    const tileSize = terrainTextureWorldSize(
      rockPixelWidth,
      options.rockTexture.source.pixelHeight,
      terrainMaterialVisuals[TerrainMaterialId.Rock].texture?.tileWidthMeters,
    );
    const soil = terrainMaterialVisuals[TerrainMaterialId.Soil];
    const rock = terrainMaterialVisuals[TerrainMaterialId.Rock];
    const soilTileSize = terrainTextureWorldSize(
      options.soilTexture.source.pixelWidth,
      options.soilTexture.source.pixelHeight,
      soil.texture?.tileWidthMeters,
    );
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
      uDensityTiling: { value: 0, type: 'f32' },
      uRockTileSize: { value: new Float32Array(tileSize), type: 'vec2<f32>' },
      uSoilTileSize: { value: new Float32Array(soilTileSize), type: 'vec2<f32>' },
      uRockOpacity: {
        value: options.rockTexture === Texture.WHITE ? 0 : (rock.texture?.opacity ?? 0),
        type: 'f32',
      },
      uSoilOpacity: {
        value: options.soilTexture === Texture.WHITE ? 0 : (soil.texture?.opacity ?? 0),
        type: 'f32',
      },
      uRockTextureFormat: {
        value: terrainTextureFormatIndex(options.rockTextureFormat),
        type: 'f32',
      },
      uRockAlphaReady: { value: options.rockAlphaTexture ? 1 : 0, type: 'f32' },
      uSoilBody: { value: normalizedColor(soil.body), type: 'vec3<f32>' },
      uSoilSurface: { value: normalizedColor(soil.surface), type: 'vec3<f32>' },
      uSoilEdge: { value: normalizedColor(soil.edge), type: 'vec3<f32>' },
      uRockBody: { value: normalizedColor(rock.body), type: 'vec3<f32>' },
      uRockSurface: { value: normalizedColor(rock.surface), type: 'vec3<f32>' },
      uRockEdge: { value: normalizedColor(rock.edge), type: 'vec3<f32>' },
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
      uGlowCount: { value: 0, type: 'i32' },
      uGlowMatrices: {
        value: new Float32Array(maxTerrainGlowSources * 4),
        type: 'vec4<f32>',
        size: maxTerrainGlowSources,
      },
      uGlowOffsets: {
        value: new Float32Array(maxTerrainGlowSources * 4),
        type: 'vec4<f32>',
        size: maxTerrainGlowSources,
      },
      uGlowBases: {
        value: new Float32Array(maxTerrainGlowSources * 4),
        type: 'vec4<f32>',
        size: maxTerrainGlowSources,
      },
      uGlowColors: {
        value: new Float32Array(maxTerrainGlowSources * 4),
        type: 'vec4<f32>',
        size: maxTerrainGlowSources,
      },
      uGlowParams: {
        value: new Float32Array(maxTerrainGlowSources * 4),
        type: 'vec4<f32>',
        size: maxTerrainGlowSources,
      },
      uGlowBounds: {
        value: new Float32Array(maxTerrainGlowSources * 4),
        type: 'vec4<f32>',
        size: maxTerrainGlowSources,
      },
      uNormalStrength: { value: 1, type: 'f32' },
      uAmbient: { value: 0.48, type: 'f32' },
      uLightBlendMode: { value: 0, type: 'f32' },
      uLightingEnabled: { value: 0, type: 'f32' },
      uMaterialMapsReady: { value: 0, type: 'f32' },
      uDisplayMode: { value: 0, type: 'f32' },
    });
    this.rockTexture = options.rockTexture;
    this.soilTexture = options.soilTexture;
    this.rockAlphaTexture = options.rockAlphaTexture;
    this.rockTextureFormat = options.rockTextureFormat;
    this.smoothing = { ...options.smoothing };
    this.orientation = options.orientation;
    this.shader = new Shader({
      glProgram: program(),
      resources: {
        uField: options.fieldTexture.source,
        uFieldSampler: options.fieldTexture.source.style,
        uSoilTexture: options.soilTexture.source,
        uSoilSampler: options.soilTexture.source.style,
        uRockTexture: options.rockTexture.source,
        uRockSampler: options.rockTexture.source.style,
        uRockAlphaTexture: (options.rockAlphaTexture ?? Texture.WHITE).source,
        uRockAlphaSampler: (options.rockAlphaTexture ?? Texture.WHITE).source.style,
        uHeightMap: Texture.WHITE.source,
        uHeightSampler: Texture.WHITE.source.style,
        uNormalMap: Texture.WHITE.source,
        uNormalSampler: Texture.WHITE.source.style,
        ...Object.fromEntries(
          Array.from({ length: maxTerrainGlowSources }, (_, i) => [
            `uGlowMask${i}`,
            Texture.EMPTY.source,
          ]),
        ),
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

  setRockTexture(texture: Texture, format: TerrainTextureFormat): void {
    if (texture === this.rockTexture && format === this.rockTextureFormat) return;
    this.rockTexture = texture;
    this.rockTextureFormat = format;
    this.shader.resources.uRockTexture = texture.source;
    this.shader.resources.uRockSampler = texture.source.style;
    this.uniforms.uniforms.uRockTileSize = new Float32Array(
      terrainTextureWorldSize(
        texture.source.pixelWidth / (format === 'albedo-normal-horizontal' ? 2 : 1),
        texture.source.pixelHeight,
        terrainMaterialVisuals[TerrainMaterialId.Rock].texture?.tileWidthMeters,
      ),
    );
    this.uniforms.uniforms.uRockOpacity =
      texture === Texture.WHITE
        ? 0
        : (terrainMaterialVisuals[TerrainMaterialId.Rock].texture?.opacity ?? 0);
    this.uniforms.uniforms.uRockTextureFormat = terrainTextureFormatIndex(format);
  }

  setDensityTiling(enabled: boolean): void {
    this.densityTiling = enabled;
    this.uniforms.uniforms.uDensityTiling = enabled ? 1 : 0;
  }

  setSoilTexture(texture: Texture): void {
    if (texture === this.soilTexture) return;
    this.soilTexture = texture;
    this.shader.resources.uSoilTexture = texture.source;
    this.shader.resources.uSoilSampler = texture.source.style;
    this.uniforms.uniforms.uSoilTileSize = new Float32Array(
      terrainTextureWorldSize(
        texture.source.pixelWidth,
        texture.source.pixelHeight,
        terrainMaterialVisuals[TerrainMaterialId.Soil].texture?.tileWidthMeters,
      ),
    );
    this.uniforms.uniforms.uSoilOpacity =
      texture === Texture.WHITE
        ? 0
        : (terrainMaterialVisuals[TerrainMaterialId.Soil].texture?.opacity ?? 0);
  }

  setRockAlphaTexture(texture: Texture | null): void {
    if (texture === this.rockAlphaTexture) return;
    this.rockAlphaTexture = texture;
    const source = texture ?? Texture.WHITE;
    this.shader.resources.uRockAlphaTexture = source.source;
    this.shader.resources.uRockAlphaSampler = source.source.style;
    this.uniforms.uniforms.uRockAlphaReady = texture ? 1 : 0;
  }

  setMaterialMaps(maps: MaterialMaps | null): void {
    if (this.materialMaps === maps) return;
    this.materialMaps = maps;
    const height = maps?.height ?? Texture.WHITE;
    const normal = maps?.normal ?? Texture.WHITE;
    this.shader.resources.uHeightMap = height.source;
    this.shader.resources.uHeightSampler = height.source.style;
    this.shader.resources.uNormalMap = normal.source;
    this.shader.resources.uNormalSampler = normal.source.style;
    this.uniforms.uniforms.uMaterialMapsReady = maps ? 1 : 0;
  }

  setLighting(settings: TerrainLightingSettings): void {
    this.lighting = settings;
    const lights = settings.enabled
      ? terrainLightsForBounds(
          settings.lights,
          this.options.chunkOriginMeters,
          this.options.chunkSizeMeters,
        )
      : [];
    const data = this.uniforms.uniforms.uLights as Float32Array;
    const colors = this.uniforms.uniforms.uLightColors as Float32Array;
    data.fill(0);
    colors.fill(0);
    lights.forEach((light, index) => {
      const offset = index * 4;
      data.set([light.position[0], light.position[1], light.radius, light.intensity], offset);
      colors.set(
        [
          ((light.color >> 16) & 0xff) / 255,
          ((light.color >> 8) & 0xff) / 255,
          (light.color & 0xff) / 255,
          1,
        ],
        offset,
      );
    });
    this.uniforms.uniforms.uLightCount = lights.length;
    const glows = settings.enabled
      ? terrainGlowsForBounds(
          settings.glows,
          this.options.chunkOriginMeters,
          this.options.chunkSizeMeters,
        )
      : [];
    this.uniforms.uniforms.uGlowCount = glows.length;
    for (let i = 0; i < maxTerrainGlowSources; i++) {
      const glow = glows[i];
      const texture = glow?.mask ?? Texture.EMPTY;
      this.shader.resources[`uGlowMask${i}`] = texture.source;
      const offset = i * 4;
      for (const name of [
        'uGlowMatrices',
        'uGlowOffsets',
        'uGlowBases',
        'uGlowColors',
        'uGlowParams',
        'uGlowBounds',
      ])
        (this.uniforms.uniforms[name] as Float32Array).fill(0, offset, offset + 4);
      if (!glow) continue;
      (this.uniforms.uniforms.uGlowMatrices as Float32Array).set(
        glow.worldToMask.slice(0, 4),
        offset,
      );
      (this.uniforms.uniforms.uGlowOffsets as Float32Array).set(
        glow.worldToMask.slice(4, 6),
        offset,
      );
      (this.uniforms.uniforms.uGlowBases as Float32Array).set(glow.haloBasis, offset);
      (this.uniforms.uniforms.uGlowBounds as Float32Array).set(glow.bounds, offset);
      (this.uniforms.uniforms.uGlowColors as Float32Array).set(
        [
          ((glow.color >> 16) & 255) / 255,
          ((glow.color >> 8) & 255) / 255,
          (glow.color & 255) / 255,
          1,
        ],
        offset,
      );
      const height = Math.max(
        0.1,
        Math.max(
          Math.hypot(glow.haloBasis[0], glow.haloBasis[1]),
          Math.hypot(glow.haloBasis[2], glow.haloBasis[3]),
        ) * 0.35,
      );
      (this.uniforms.uniforms.uGlowParams as Float32Array).set(
        [glow.strength, glow.opacity, height, 0],
        offset,
      );
    }
    this.uniforms.uniforms.uNormalStrength = settings.normalStrength;
    this.uniforms.uniforms.uAmbient = settings.ambient;
    this.uniforms.uniforms.uLightBlendMode =
      settings.blendMode === 'add' ? 1 : settings.blendMode === 'screen' ? 2 : 0;
    this.uniforms.uniforms.uLightingEnabled = settings.enabled ? 1 : 0;
    this.uniforms.uniforms.uDisplayMode =
      settings.display === 'albedo'
        ? 1
        : settings.display === 'height'
          ? 2
          : settings.display === 'normal'
            ? 3
            : 0;
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
      soilTexture: this.soilTexture,
      rockTexture: this.rockTexture,
      rockAlphaTexture: this.rockAlphaTexture,
      rockTextureFormat: this.rockTextureFormat,
      smoothing: this.smoothing,
      orientation: this.orientation,
    });
    instance.setMaterialMaps(this.materialMaps);
    instance.setDensityTiling(this.densityTiling);
    if (this.lighting) instance.setLighting(this.lighting);
    return instance;
  }

  syncMaterialFrom(source: TerrainChunkMesh): void {
    this.setDensityTiling(source.densityTiling);
    this.setSoilTexture(source.soilTexture);
    this.setRockTexture(source.rockTexture, source.rockTextureFormat);
    this.setRockAlphaTexture(source.rockAlphaTexture);
    this.setMaterialMaps(source.materialMaps);
    if (source.lighting) this.setLighting(source.lighting);
    this.setSettings(source.smoothing, source.orientation);
  }

  destroy(): void {
    this.view.destroy();
    this.geometry.destroy();
    this.shader.destroy();
  }
}
