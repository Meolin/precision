import type { ProjectileState } from '../ballistics/Projectile';
import type { GameConfig } from '../config/GameConfig';
import type { Vec2 } from '../math/Vec2';
import { circleTouchesTerrain } from '../terrain/terrainCollision';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import type { RicochetImpactResolution } from './ImpactResolution';

/** Find the first free disk along the outward normal; the search is bounded. */
export function separateRicochet(
  position: Vec2,
  normal: Vec2,
  radius: number,
  terrain: TerrainGrid,
): Vec2 | null {
  if (![position.x, position.y, normal.x, normal.y, radius].every(Number.isFinite) || radius < 0)
    return null;
  const epsilon = Math.max(terrain.cellSizeMeters * 0.1, radius * 0.1);
  const limit = radius + terrain.cellSizeMeters * 2;
  for (let step = 1; step <= 32 && step * epsilon <= limit; step++) {
    const candidate = {
      x: position.x + normal.x * step * epsilon,
      y: position.y + normal.y * step * epsilon,
    };
    if (!circleTouchesTerrain(terrain, candidate, radius)) return candidate;
  }
  return null;
}

/** Shared by live flight and preview; detached positions prevent a stale swept segment. */
export function applyRicochetContinuation(
  projectile: ProjectileState,
  resolution: RicochetImpactResolution,
  config: GameConfig,
): void {
  projectile.position = { ...resolution.finalPosition };
  projectile.previousPosition = { ...resolution.finalPosition };
  projectile.velocity = { ...resolution.remainingVelocity };
  projectile.ricochetCount = resolution.ricochetCount;
  projectile.penetrationState = undefined;
  projectile.alive =
    projectile.lifetimeSeconds < projectile.maxLifetimeSeconds &&
    projectile.position.x >= -projectile.radius &&
    projectile.position.x <= config.world.widthMeters + projectile.radius &&
    projectile.position.y <= config.world.heightMeters + projectile.radius;
}
