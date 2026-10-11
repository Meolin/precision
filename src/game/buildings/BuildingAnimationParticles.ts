import type {
  BuildingAnimationConfig,
  BuildingAnimationStage,
  BuildingAnimationTrackProperty,
} from './BuildingAnimationConfig';
import { defaultTrackValue, sampleBuildingTrack } from './BuildingAnimationKeyframes';
import type { ParticleCurvePoint } from './BuildingAnimationEffects';
import {
  animationColor,
  animationResourceEnabled,
  inverseAnimationPoint,
  resourceMatrix,
  transformAnimationPoint,
  type AnimationMatrix,
} from './BuildingAnimationTransform';

export function animationStageVisible(stage: BuildingAnimationStage, progress: number): boolean {
  return (
    stage.enabled !== false &&
    !stage.hidden &&
    progress >= stage.inPoint &&
    (progress < stage.outPoint || (progress === 1 && stage.outPoint === 1))
  );
}
export function animationStageSampler(
  config: BuildingAnimationConfig,
  stage: BuildingAnimationStage,
) {
  const tracks = new Map(
    config.tracks
      .filter((track) => track.stageId === stage.id)
      .map((track) => [track.property, track]),
  );
  return (property: BuildingAnimationTrackProperty, progress: number) =>
    sampleBuildingTrack(tracks.get(property), progress, defaultTrackValue(stage, property));
}
function random(seed: number, index: number, channel: number): number {
  let value = Math.imul(index + 1, 374761393) ^ Math.imul(seed + channel, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}
export function sampleParticleCurve(
  curve: ParticleCurvePoint[] | undefined,
  age: number,
  fallback: number,
): number {
  if (!curve?.length) return fallback;
  if (age <= curve[0]!.age) return curve[0]!.value;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1]!,
      b = curve[i]!;
    if (age <= b.age) return a.value + ((b.value - a.value) * (age - a.age)) / (b.age - a.age);
  }
  return curve.at(-1)!.value;
}
interface ParticleBirth {
  id: number;
  seconds: number;
  lifetime: number;
  admitted: boolean;
}
export interface ParticlePlan {
  births: ParticleBirth[];
  sample: ReturnType<typeof animationStageSampler>;
  matrices: Map<number, AnimationMatrix>;
  sourceMatrices: Map<number, AnimationMatrix>;
}
export function createParticlePlan(
  config: BuildingAnimationConfig,
  stage: BuildingAnimationStage,
): ParticlePlan {
  const sample = animationStageSampler(config, stage);
  const duration = config.timeline.durationSeconds,
    start = (stage.emissionStart ?? stage.inPoint) * duration,
    end = stage.outPoint * duration;
  const budget = stage.particleBudget ?? 600,
    births: ParticleBirth[] = [];
  const deaths: number[] = [];
  const retire = () => {
    const last = deaths.pop()!;
    if (!deaths.length) return;
    deaths[0] = last;
    let index = 0;
    while (index * 2 + 1 < deaths.length) {
      let child = index * 2 + 1;
      if (child + 1 < deaths.length && deaths[child + 1]! < deaths[child]!) child++;
      if (deaths[index]! <= deaths[child]!) break;
      [deaths[index], deaths[child]] = [deaths[child]!, deaths[index]!];
      index = child;
    }
  };
  const admit = (death: number) => {
    deaths.push(death);
    let index = deaths.length - 1;
    while (index > 0) {
      const parent = (index - 1) >>> 1;
      if (deaths[parent]! <= deaths[index]!) break;
      [deaths[parent], deaths[index]] = [deaths[index]!, deaths[parent]!];
      index = parent;
    }
  };
  const add = (seconds: number) => {
    const id = births.length,
      lifetime = Math.min(10, Math.max(0.05, sample('fxLifetime', seconds / duration)));
    while (deaths.length && deaths[0]! <= seconds) retire();
    const admitted = deaths.length < budget;
    if (admitted) admit(seconds + lifetime);
    births.push({ id, seconds, lifetime, admitted });
  };
  if (stage.emissionMode === 'burst') {
    for (let i = 0; i < (stage.burstCount ?? 24); i++) add(start);
  } else if (
    !config.tracks.some((track) => track.stageId === stage.id && track.property === 'fxRate')
  ) {
    const from = start - (stage.prewarmSeconds ?? 0),
      rate = sample('fxRate', 0);
    if (rate > 0)
      for (let number = 1; from + number / rate < end - 1e-8; number++) add(from + number / rate);
  } else {
    const from = start - (stage.prewarmSeconds ?? 0),
      step = 1 / 120;
    let accumulated = 0;
    for (let tick = 0; from + tick * step < end; tick++) {
      const a = from + tick * step,
        b = Math.min(end, a + step);
      const rate = (sample('fxRate', a / duration) + sample('fxRate', b / duration)) / 2;
      const previous = accumulated;
      accumulated += rate * (b - a);
      for (
        let number = Math.floor(previous) + 1;
        number <= Math.floor(accumulated + 1e-8);
        number++
      ) {
        const birth = a + (number - previous) / Math.max(0.00001, rate);
        if (birth < end - 1e-8) add(birth);
      }
    }
  }
  return { births, sample, matrices: new Map(), sourceMatrices: new Map() };
}
export interface AnimationParticle {
  id: number;
  x: number;
  y: number;
  size: number;
  alpha: number;
  color: number;
  rotation: number;
  stretch: number;
  trail: number;
  vx: number;
  vy: number;
  frame: number;
}
export interface ParticleFrame {
  particles: AnimationParticle[];
  alive: number;
  rejected: number;
  limit: number;
}

export function liveParticleBirths(plan: ParticlePlan, seconds: number) {
  let low = 0,
    high = plan.births.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (plan.births[mid]!.seconds <= seconds - 10) low = mid + 1;
    else high = mid;
  }
  const births: ParticleBirth[] = [];
  for (let i = low; i < plan.births.length; i++) {
    const birth = plan.births[i]!;
    if (birth.seconds > seconds) break;
    if (birth.seconds + birth.lifetime > seconds) births.push(birth);
  }
  return births;
}
export function sampleParticleFrame(
  config: BuildingAnimationConfig,
  stage: BuildingAnimationStage,
  progress: number,
  plan: ParticlePlan,
  contour?: readonly { x: number; y: number }[],
): ParticleFrame {
  const result: ParticleFrame = {
    particles: [],
    alive: 0,
    rejected: 0,
    limit: stage.particleBudget ?? 600,
  };
  if (
    stage.kind !== 'particles' ||
    !animationResourceEnabled(config, stage) ||
    progress < stage.inPoint
  )
    return result;
  if (stage.emitterShape === 'contour' && (!stage.shapeSourceId || !contour?.length)) return result;
  if (stage.endBehavior === 'cut' && !animationStageVisible(stage, progress)) return result;
  const duration = config.timeline.durationSeconds,
    now = progress * duration,
    seed = stage.seed ?? 1,
    sample = plan.sample;
  if (stage.endBehavior === 'fade' && now >= stage.outPoint * duration + 0.5) return result;
  for (const birth of liveParticleBirths(plan, now)) {
    const age = now - birth.seconds;
    if (!birth.admitted) {
      result.rejected++;
      continue;
    }
    const t = birth.seconds / duration,
      fraction = age / birth.lifetime,
      at = (property: BuildingAnimationTrackProperty) => sample(property, t);
    let point = { x: 0, y: 0 };
    const r = random(seed, birth.id, 6),
      q = random(seed, birth.id, 7);
    if (stage.emitterShape === 'line') point.x = (r - 0.5) * at('fxEmitterWidth');
    if (stage.emitterShape === 'rectangle')
      point = { x: (r - 0.5) * at('fxEmitterWidth'), y: (q - 0.5) * at('fxEmitterHeight') };
    if (stage.emitterShape === 'circle') {
      const radius = Math.sqrt(r) * at('fxEmitterRadius');
      point = { x: Math.cos(q * Math.PI * 2) * radius, y: Math.sin(q * Math.PI * 2) * radius };
    }
    let matrix = plan.matrices.get(birth.id);
    if (!matrix) {
      matrix = resourceMatrix(config, stage.id, t);
      plan.matrices.set(birth.id, matrix);
    }
    const composition = stage.particleSpace === 'composition';
    if (composition) point = transformAnimationPoint(matrix, point);
    if (stage.emitterShape === 'contour' && stage.shapeSourceId && contour?.length) {
      let sourceMatrix = plan.sourceMatrices.get(birth.id);
      if (!sourceMatrix) {
        sourceMatrix = resourceMatrix(config, stage.shapeSourceId, t);
        plan.sourceMatrices.set(birth.id, sourceMatrix);
      }
      const sourcePoint = transformAnimationPoint(
        sourceMatrix,
        contour[Math.floor(r * contour.length)]!,
      );
      point = composition ? sourcePoint : inverseAnimationPoint(matrix, sourcePoint);
    }
    const angle =
      ((at('fxDirection') + (random(seed, birth.id, 2) - 0.5) * at('fxSpread')) * Math.PI) / 180;
    const speed = at('fxSpeed') * (0.65 + random(seed, birth.id, 3) * 0.7);
    let vx = Math.cos(angle) * speed,
      vy = Math.sin(angle) * speed;
    if (composition) {
      const x = vx;
      vx = matrix.a * x + matrix.c * vy;
      vy = matrix.b * x + matrix.d * vy;
    }
    const gravityAngle = (at('fxGravityAngle') * Math.PI) / 180;
    let gx = Math.cos(gravityAngle) * at('fxGravity'),
      gy = Math.sin(gravityAngle) * at('fxGravity');
    if (composition && stage.gravitySpace === 'local') {
      const x = gx;
      gx = matrix.a * x + matrix.c * gy;
      gy = matrix.b * x + matrix.d * gy;
    }
    if (!composition && stage.gravitySpace === 'composition') {
      const det = matrix.a * matrix.d - matrix.b * matrix.c;
      if (Math.abs(det) > 1e-8) {
        const x = gx;
        gx = (matrix.d * x - matrix.c * gy) / det;
        gy = (-matrix.b * x + matrix.a * gy) / det;
      }
    }
    const frequency = 2 + random(seed, birth.id, 8) * 3,
      phase = random(seed, birth.id, 9) * Math.PI * 2;
    const drift = at('fxTurbulence') * (Math.sin(age * frequency + phase) - Math.sin(phase));
    const smoke = stage.particlePreset === 'smoke';
    const fade =
      stage.endBehavior === 'fade'
        ? Math.max(0, 1 - Math.max(0, now - stage.outPoint * duration) / 0.5)
        : 1;
    let color = animationColor(at);
    const colors = stage.colorCurve;
    if (colors?.length) {
      const next = colors.findIndex((item) => item.age >= fraction),
        a = next < 0 ? colors.at(-1)! : colors[Math.max(0, next - 1)]!,
        b = next < 0 ? colors.at(-1)! : colors[next]!;
      const amount = Math.max(0, Math.min(1, (fraction - a.age) / Math.max(1e-8, b.age - a.age)));
      const ca = parseInt(a.color.slice(1), 16),
        cb = parseInt(b.color.slice(1), 16);
      const channel = (shift: number) =>
        Math.round(
          ((ca >>> shift) & 255) + (((cb >>> shift) & 255) - ((ca >>> shift) & 255)) * amount,
        );
      color = (channel(16) << 16) | (channel(8) << 8) | channel(0);
    }
    result.particles.push({
      id: birth.id,
      x: point.x + vx * age + (gx * age * age) / 2 + at('fxWind') * age + drift,
      y: point.y + vy * age + (gy * age * age) / 2,
      size:
        at('fxSize') *
        (composition ? Math.sqrt(Math.abs(matrix.a * matrix.d - matrix.b * matrix.c)) : 1) *
        (0.7 + random(seed, birth.id, 4) * 0.6) *
        sampleParticleCurve(
          stage.sizeCurve,
          fraction,
          smoke ? 1 + fraction * 2 : 1 - fraction * 0.7,
        ),
      alpha:
        sampleParticleCurve(stage.alphaCurve, fraction, (1 - fraction) * (smoke ? 0.14 : 1)) *
        fade *
        (1 - at('fxFlicker') * (0.5 + 0.5 * Math.sin(age * 18 + phase))),
      color,
      rotation: Math.atan2(vy + gy * age, vx + gx * age),
      stretch: at('fxStretch'),
      trail: Math.min(age, at('fxTrail')),
      vx: vx + gx * age,
      vy: vy + gy * age,
      frame: Math.floor(age * at('fxFrameRate')),
    });
  }
  result.alive = result.particles.length;
  return result;
}
export function sampleAnimationParticles(
  config: BuildingAnimationConfig,
  stage: BuildingAnimationStage,
  progress: number,
): AnimationParticle[] {
  return sampleParticleFrame(config, stage, progress, createParticlePlan(config, stage)).particles;
}
