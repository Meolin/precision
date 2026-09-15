import type { EntityDamageEvent } from '../combat/EntityDamageEvent';
import type { EntityImpactEvent } from '../combat/EntityImpactEvent';
import type { GameConfig } from '../config/GameConfig';
import { clamp, type Vec2 } from '../math/Vec2';

/** Presentation tuning, independent of weapon damage and simulation snapshots. */
export const damagePopupSettings = Object.freeze({
  fullStrengthEnergyJ: 10_000,
  maxDistanceMultiplier: 3,
  maxSizeMultiplier: 2,
  maxTravelSeconds: 5,
  holdSeconds: 0.4,
  fadeSeconds: 0.3,
});

export interface DamagePopup {
  readonly origin: Readonly<Vec2>;
  readonly initialVelocity: Readonly<Vec2>;
  readonly damage: number;
  readonly sizeMultiplier: number;
  /** Positive value moves the card toward world up; simulation y grows downward. */
  readonly verticalRiseSpeedMetersPerSecond: number;
  readonly velocityCurve: GameConfig['damagePopup']['velocityCurve'];
  readonly createdAtSeconds: number;
  readonly stopAfterSeconds: number;
  readonly expiresAtSeconds: number;
}

export function createDamagePopup(
  impact: EntityImpactEvent,
  damage: EntityDamageEvent,
  createdAtSeconds: number,
  config: GameConfig['damagePopup'],
): DamagePopup {
  const settings = damagePopupSettings;
  const strength = clamp(impact.kineticEnergyJ / settings.fullStrengthEnergyJ, 0, 1);
  const distance =
    config.baseDistanceMeters * (1 + strength * (settings.maxDistanceMultiplier - 1));
  const initialVelocity = {
    x: impact.velocity.x * config.initialSpeedMultiplier,
    y: impact.velocity.y * config.initialSpeedMultiplier,
  };
  const speed = Math.hypot(initialVelocity.x, initialVelocity.y);
  const curve = {
    control1: { ...config.velocityCurve.control1 },
    control2: { ...config.velocityCurve.control2 },
  };
  // Use the curve's average velocity so its shape changes timing but preserves travel distance.
  // Very slow contacts settle sooner instead of keeping effects alive indefinitely.
  const naturalStopAfterSeconds =
    speed > 0
      ? Math.min(distance / (speed * averageVelocityCurve(curve)), settings.maxTravelSeconds)
      : 0;
  const stopAfterSeconds = Math.min(
    naturalStopAfterSeconds * config.animationDurationMultiplier,
    settings.maxTravelSeconds,
  );
  return {
    origin: { ...impact.position },
    initialVelocity,
    damage: damage.damage,
    sizeMultiplier:
      config.initialSizeMultiplier * (1 + strength * (settings.maxSizeMultiplier - 1)),
    verticalRiseSpeedMetersPerSecond: config.verticalRiseSpeedMetersPerSecond,
    velocityCurve: curve,
    createdAtSeconds,
    stopAfterSeconds,
    expiresAtSeconds:
      createdAtSeconds + stopAfterSeconds + settings.holdSeconds + settings.fadeSeconds,
  };
}

/** Analytic motion stays smooth at any render rate and never overshoots or reverses. */
export function sampleDamagePopup(popup: DamagePopup, timeSeconds: number) {
  const age = Math.max(0, timeSeconds - popup.createdAtSeconds);
  const progress = popup.stopAfterSeconds > 0 ? clamp(age / popup.stopAfterSeconds, 0, 1) : 1;
  const travelSeconds =
    popup.stopAfterSeconds * integratedVelocityCurve(popup.velocityCurve, progress);
  const fadeProgress = clamp(
    (age - popup.stopAfterSeconds - damagePopupSettings.holdSeconds) /
      damagePopupSettings.fadeSeconds,
    0,
    1,
  );
  return {
    x: popup.origin.x + popup.initialVelocity.x * travelSeconds,
    y:
      popup.origin.y +
      popup.initialVelocity.y * travelSeconds -
      popup.verticalRiseSpeedMetersPerSecond * age,
    alpha: 1 - fadeProgress * fadeProgress * (3 - 2 * fadeProgress),
  };
}

/** Velocity is a cubic Bezier curve: time on x, speed multiplier on y. */
function velocityAt(curve: DamagePopup['velocityCurve'], time: number): number {
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 14; iteration++) {
    const parameter = (low + high) / 2;
    if (cubicBezier(0, curve.control1.x, curve.control2.x, 1, parameter) < time) low = parameter;
    else high = parameter;
  }
  return clamp(cubicBezier(1, curve.control1.y, curve.control2.y, 0, (low + high) / 2), 0, 1);
}

function cubicBezier(
  start: number,
  control1: number,
  control2: number,
  end: number,
  t: number,
): number {
  const inverse = 1 - t;
  return (
    inverse ** 3 * start +
    3 * inverse ** 2 * t * control1 +
    3 * inverse * t ** 2 * control2 +
    t ** 3 * end
  );
}

/** Trapezoidal integration is deterministic and plenty smooth for a display-only effect. */
function integratedVelocityCurve(curve: DamagePopup['velocityCurve'], progress: number): number {
  const samples = 24;
  const step = progress / samples;
  let area = 0;
  let previous = velocityAt(curve, 0);
  for (let index = 1; index <= samples; index++) {
    const time = step * index;
    const current = velocityAt(curve, time);
    area += ((previous + current) * step) / 2;
    previous = current;
  }
  return area;
}

function averageVelocityCurve(curve: DamagePopup['velocityCurve']): number {
  return Math.max(integratedVelocityCurve(curve, 1), 0.01);
}
