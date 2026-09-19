import type { GameConfig } from '../config/GameConfig';
import type { CannonState } from '../entities/Cannon';
import type { UnitState } from '../entities/UnitState';
import { clamp, toRadians, type EntityId, type Vec2 } from '../math/Vec2';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import { createProjectile } from './Projectile';
import { advanceProjectile } from './projectilePhysics';

export interface BallisticSolution {
  angleRad: number;
  missDistanceMeters: number;
  flightSeconds: number;
}

function segmentDistance(point: Vec2, start: Vec2, end: Vec2): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const denominator = dx * dx + dy * dy;
  const t =
    denominator > 0
      ? clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / denominator, 0, 1)
      : 0;
  return Math.hypot(point.x - start.x - t * dx, point.y - start.y - t * dy);
}

/** Bounded deterministic angle search. No terrain/health mutation or ricochet search. */
export function solveBallisticAim(
  cannon: CannonState,
  target: Vec2,
  terrain: TerrainGrid,
  config: GameConfig,
  units: readonly UnitState[],
  targetEntityId?: EntityId,
): BallisticSolution | null {
  if (!cannon.alive || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return null;
  const dt = 1 / config.simulation.tickRate;
  const min = toRadians(config.cannon.minAngleDeg);
  const max = toRadians(config.cannon.maxAngleDeg);
  const left = target.x < cannon.position.x;
  type Candidate = BallisticSolution & { elevation: number; valid: boolean };
  const candidates: Candidate[] = [];
  const sampled = new Set<number>();
  const evaluate = (elevation: number) => {
    elevation = clamp(elevation, min, max);
    if (sampled.has(elevation)) return;
    sampled.add(elevation);
    const angleRad = left ? Math.PI - elevation : elevation;
    const projectile = createProjectile({ ...cannon, angleRad }, config, -1, 0);
    const maxTicks = Math.min(
      config.rts.solverMaxTicksPerCandidate,
      Math.ceil(Math.min(config.rts.solverMaxSeconds, projectile.maxLifetimeSeconds) / dt),
    );
    let missDistanceMeters = Infinity;
    let valid = false;
    let flightSeconds = 0;
    for (let tick = 0; tick < maxTicks && projectile.alive; tick++) {
      // Shared with live shots and preview: integration, swept collisions,
      // owner exclusion, lifetime and world bounds. Stop at the first contact.
      const hit = advanceProjectile(projectile, terrain, config, dt, undefined, units);
      const distance = segmentDistance(target, projectile.previousPosition, projectile.position);
      if (distance < missDistanceMeters) {
        missDistanceMeters = distance;
        flightSeconds = projectile.lifetimeSeconds;
      }
      if (targetEntityId !== undefined) {
        if (hit?.type === 'entity' && hit.entityId === targetEntityId) {
          valid = true;
          missDistanceMeters = 0;
          flightSeconds = projectile.lifetimeSeconds;
        }
      } else if ((!hit || hit.type === 'terrain') && distance <= config.rts.solverToleranceMeters) {
        valid = true;
      }
      if (valid || hit) break;
    }
    candidates.push({ angleRad, elevation, missDistanceMeters, flightSeconds, valid });
  };
  let spacing = toRadians(config.rts.solverAngleStepDeg);
  const steps = Math.max(1, Math.ceil((max - min) / spacing));
  spacing = (max - min) / steps;
  for (let index = 0; index <= steps; index++) evaluate(min + spacing * index);
  for (let round = 0; round < config.rts.solverRefinements; round++) {
    const promising = [...candidates]
      .sort((a, b) => a.missDistanceMeters - b.missDistanceMeters || a.elevation - b.elevation)
      .slice(0, 4);
    spacing /= 4;
    for (const candidate of promising)
      for (const offset of [-3, -2, -1, 1, 2, 3]) evaluate(candidate.elevation + spacing * offset);
  }
  const solution = candidates
    .filter((candidate) => candidate.valid)
    .sort(
      (a, b) =>
        a.missDistanceMeters - b.missDistanceMeters ||
        a.flightSeconds - b.flightSeconds ||
        a.elevation - b.elevation,
    )[0];
  return solution
    ? {
        angleRad: solution.angleRad,
        missDistanceMeters: solution.missDistanceMeters,
        flightSeconds: solution.flightSeconds,
      }
    : null;
}
