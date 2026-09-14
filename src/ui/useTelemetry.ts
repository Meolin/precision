import { useEffect, useState } from 'react';
import { kineticEnergy } from '../game/ballistics/projectilePhysics';
import type { GameRuntime } from '../game/core/GameRuntime';
import { toDegrees } from '../game/math/Vec2';

function readTelemetry(runtime: GameRuntime) {
  const state = runtime.getState();
  const config = runtime.getConfig();
  const projectile = state.projectiles.at(-1);
  return {
    tick: state.tick,
    seconds: state.elapsedSeconds,
    seed: state.seed,
    shots: state.shotsFired,
    active: state.projectiles.length,
    angle: toDegrees(state.cannon.angleRad),
    speed: projectile ? Math.hypot(projectile.velocity.x, projectile.velocity.y) : null,
    energy: projectile ? kineticEnergy(projectile.massKg, projectile.velocity) : null,
    impactEnergy: state.lastImpact?.energyJoules ?? null,
    crater: state.lastImpact?.damage.radius ?? null,
    removed: state.lastImpact?.removedCells ?? null,
    velocity: config.projectile.muzzleVelocity,
    mass: config.projectile.massKg,
    muzzleEnergy: 0.5 * config.projectile.massKg * config.projectile.muzzleVelocity ** 2,
    terrainVersion: state.terrain.version,
    queued: runtime.pendingCommands,
  };
}

/** Sample a small HUD at 10 Hz. World coordinates never enter React state. */
export function useTelemetry(runtime: GameRuntime) {
  const [telemetry, setTelemetry] = useState(() => readTelemetry(runtime));
  useEffect(() => {
    const timer = window.setInterval(() => setTelemetry(readTelemetry(runtime)), 100);
    return () => window.clearInterval(timer);
  }, [runtime]);
  return telemetry;
}

export function formatNumber(value: number | null, digits = 0): string {
  return value === null
    ? '—'
    : value.toLocaleString('ru-RU', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
}
