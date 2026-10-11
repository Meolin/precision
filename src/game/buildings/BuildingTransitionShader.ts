export const buildingTransitionVertex = `
precision highp float;
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vUv;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
  vUv = aPosition;
}`;

// All effects preserve premultiplied alpha and skip work at both exact endpoints.
// UVs use the filter's actual frame, rather than assuming a power-of-two buffer is the image.
export const buildingTransitionFragment = `
precision highp float;
in vec2 vTextureCoord;
in vec2 vUv;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform vec4 uOutputFrame;
uniform float uEffect;
uniform float uIncoming;
uniform float uProgress;
uniform float uNoiseScale;
uniform float uDirectionStrength;
uniform float uDirection;
uniform float uEdgeWidth;
uniform float uEdgeIntensity;
uniform vec3 uEdgeColor;
uniform float uEdgeBlendMode;
uniform float uSoftness;
uniform float uStrength;
uniform float uSegments;
uniform float uAngle;
uniform vec2 uCenter;
uniform float uSeed;
uniform float uReverse;
uniform float uAspect;
const float PI = 3.14159265359;
vec4 readImage(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  vec2 coord = vTextureCoord + (uv - vUv) * uOutputFrame.zw * uInputSize.zw;
  return texture(uTexture, clamp(coord, uInputClamp.xy, uInputClamp.zw));
}
float hash(vec2 p) {
  return fract(sin(dot(p + vec2(uSeed * 0.13, uSeed * 0.71), vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float directionValue(vec2 uv) {
  float d = 0.5;
  if (uDirection == 1.0) d = 1.0 - uv.y;
  else if (uDirection == 2.0) d = uv.y;
  else if (uDirection == 3.0) d = abs(uv.y - uCenter.y) / max(uCenter.y, 1.0 - uCenter.y);
  else if (uDirection == 4.0) d = 1.0 - abs(uv.y - uCenter.y) / max(uCenter.y, 1.0 - uCenter.y);
  else if (uDirection == 5.0) d = uv.x;
  else if (uDirection == 6.0) d = 1.0 - uv.x;
  else if (uDirection == 7.0) d = (uv.x + uv.y) * 0.5;
  else if (uDirection == 8.0) d = (1.0 - uv.x + uv.y) * 0.5;
  else if (uDirection == 9.0) d = (uv.x + 1.0 - uv.y) * 0.5;
  else if (uDirection == 10.0) d = 1.0 - (uv.x + uv.y) * 0.5;
  return d;
}
vec3 edgeBlend(vec3 base) {
  if (uEdgeBlendMode == 1.0) return min(vec3(1.0), base + uEdgeColor);
  if (uEdgeBlendMode == 2.0) return 1.0 - (1.0 - base) * (1.0 - uEdgeColor);
  if (uEdgeBlendMode == 3.0) return base * uEdgeColor;
  if (uEdgeBlendMode == 4.0) return mix(2.0 * base * uEdgeColor,
    1.0 - 2.0 * (1.0 - base) * (1.0 - uEdgeColor), step(vec3(0.5), base));
  return uEdgeColor;
}
void main(void) {
  vec4 source = readImage(vUv);
  if (uProgress <= 0.0 || uProgress >= 1.0) {
    finalColor = source * (uIncoming > 0.5 ? step(1.0, uProgress) : 1.0 - step(1.0, uProgress));
    return;
  }
  float envelope = sin(PI * uProgress);
  vec2 offset = vUv - uCenter;
  vec2 metric = offset * vec2(uAspect, 1.0);
  vec2 farCorner = max(uCenter, 1.0 - uCenter);
  float radius = length(metric) / max(0.001, length(farCorner * vec2(uAspect, 1.0)));
  float directional = directionValue(vUv);
  float threshold = directional;
  float segments = max(2.0, uSegments);
  float soft = max(0.0001, uSoftness);
  if (uEffect == 1.0) {
    float tintAmount = uIncoming > 0.5 ? 2.0 * (1.0 - uProgress) : 2.0 * uProgress;
    finalColor = vec4(mix(source.rgb, uEdgeColor * source.a, clamp(tintAmount, 0.0, 1.0)), source.a);
    return;
  }
  if (uEffect == 2.0) {
    finalColor = vec4(mix(source.rgb, uEdgeColor * source.a, clamp(envelope * uStrength, 0.0, 1.0)), source.a);
    return;
  }
  if (uEffect == 3.0) {
    vec2 vector = vec2(cos(uAngle), sin(uAngle));
    if (uAngle != 0.0) threshold = 0.5 + dot(vUv - 0.5, vector) / (abs(vector.x) + abs(vector.y));
    else if (uDirection == 0.0) threshold = vUv.x;
  } else if (uEffect == 4.0 || uEffect == 5.0) {
    float angle = atan(metric.y, metric.x) - uAngle;
    threshold = uEffect == 4.0 ? abs(atan(sin(angle), cos(angle))) / PI : fract(angle / (2.0 * PI) + 1.0);
  } else if (uEffect == 6.0) threshold = radius;
  else if (uEffect == 7.0) threshold = max(abs(offset.x) / farCorner.x, abs(offset.y) / farCorner.y);
  else if (uEffect == 8.0) threshold = (abs(offset.x) + abs(offset.y)) / (farCorner.x + farCorner.y);
  else if (uEffect == 9.0) threshold = fract(vUv.y * segments);
  else if (uEffect == 10.0) threshold = fract(vUv.x * segments);
  else if (uEffect == 11.0) {
    vec2 cell = vUv * segments;
    float parity = mod(floor(cell.x) + floor(cell.y), 2.0);
    threshold = (parity + max(fract(cell.x), fract(cell.y))) * 0.5;
  } else if (uEffect == 12.0) threshold = fract(dot(vUv, vec2(cos(uAngle + PI * 0.25), sin(uAngle + PI * 0.25))) * segments);
  else if (uEffect == 13.0) {
    bool horizontal = uDirection == 5.0 || uDirection == 6.0 || uDirection == 0.0;
    threshold = horizontal ? abs(offset.x) / farCorner.x : abs(offset.y) / farCorner.y;
  } else if (uEffect == 14.0) {
    threshold = mix(noise(vUv * uNoiseScale), directional, uDirectionStrength);
    soft = max(0.15, uSoftness);
  } else if (uEffect == 15.0 || uEffect == 20.0) threshold = mix(noise(vUv * uNoiseScale), directional, uDirectionStrength);
  else if (uEffect == 16.0) threshold = mix(hash(floor(vUv * segments)), directional, uDirectionStrength);
  else if (uEffect == 17.0) { threshold = hash(floor(vUv * segments * 8.0)); soft = 0.0001; }
  else if (uEffect == 18.0) threshold = source.a > 0.001 ? dot(source.rgb / source.a, vec3(0.2126, 0.7152, 0.0722)) : 0.5;
  else if (uEffect == 19.0) threshold = clamp(radius * 0.6 + noise(vUv * uNoiseScale) * 0.25 + noise(vUv * uNoiseScale * 3.0) * 0.15, 0.0, 1.0);
  else if (uEffect == 21.0) threshold = directional * 0.85 + fract(vUv.y * segments) * 0.15;
  if (uEffect >= 3.0 && uEffect <= 21.0) {
    if (uReverse > 0.5) threshold = 1.0 - threshold;
    float shown = 1.0 - smoothstep(uProgress - soft, uProgress + soft, threshold);
    float edge = 0.0;
    if (uEffect == 15.0 || uEffect == 20.0 || uEffect == 21.0)
      edge = clamp((1.0 - smoothstep(0.0, max(0.001, uEdgeWidth), abs(threshold - uProgress))) * uEdgeIntensity * envelope, 0.0, 1.0);
    if (uIncoming > 0.5) {
      vec3 base = source.a > 0.001 ? source.rgb / source.a : vec3(0.0);
      vec3 glow = edgeBlend(base);
      if (uEffect == 20.0) glow = mix(vec3(0.09, 0.015, 0.0), glow, edge);
      float alpha = source.a * max(shown, edge);
      finalColor = vec4(mix(base, glow, edge) * alpha, alpha);
    } else finalColor = source * (1.0 - shown);
    return;
  }
  vec2 uv = vUv;
  float intensity = uStrength * envelope;
  if (uEffect == 22.0) {
    vec2 delta = vec2(0.035 * intensity);
    source = (source * 4.0 + readImage(uv + vec2(delta.x, 0.0)) + readImage(uv - vec2(delta.x, 0.0))
      + readImage(uv + vec2(0.0, delta.y)) + readImage(uv - vec2(0.0, delta.y))
      + readImage(uv + delta) + readImage(uv - delta) + readImage(uv + vec2(delta.x, -delta.y))
      + readImage(uv + vec2(-delta.x, delta.y))) / 12.0;
  } else if (uEffect == 23.0) {
    float cellSize = intensity / segments;
    if (cellSize > 0.00001) source = readImage((floor(uv / cellSize) + 0.5) * cellSize);
  } else if (uEffect == 24.0) {
    float shift = (hash(vec2(floor(uv.y * segments), floor(uProgress * 24.0))) - 0.5) * intensity * 0.25;
    source = readImage(uv + vec2(shift, 0.0));
    source.rb = vec2(readImage(uv + vec2(shift + intensity * 0.015, 0.0)).r,
      readImage(uv + vec2(shift - intensity * 0.015, 0.0)).b);
    source.rgb = min(source.rgb, vec3(source.a));
  } else if (uEffect == 25.0) {
    vec2 direction = vec2(cos(uAngle), sin(uAngle));
    source = readImage(uv + direction * sin(dot(uv, vec2(-direction.y, direction.x)) * segments * 2.0 * PI + uProgress * 2.0 * PI) * intensity * 0.04);
  } else if (uEffect == 26.0) {
    source = readImage(uv + normalize(offset + vec2(0.00001)) * sin(length(metric) * segments * 2.0 * PI - uProgress * 4.0 * PI) * intensity * 0.025);
  } else if (uEffect == 27.0) {
    float angle = intensity * (1.0 - clamp(radius, 0.0, 1.0)) * PI * (uReverse > 0.5 ? -1.0 : 1.0);
    vec2 rotated = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * metric;
    source = readImage(uCenter + rotated / vec2(uAspect, 1.0));
  } else if (uEffect == 28.0) {
    vec2 delta = vec2(cos(uAngle), sin(uAngle)) * intensity * 0.035;
    vec4 red = readImage(uv + delta); vec4 blue = readImage(uv - delta);
    source = vec4(red.r, source.g, blue.b, max(source.a, max(red.a, blue.a)));
  }
  finalColor = source;
}`;
