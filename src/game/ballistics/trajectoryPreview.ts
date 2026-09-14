import type { GameConfig } from '../config/GameConfig';
import type { CannonState } from '../entities/Cannon';
import type { Vec2 } from '../math/Vec2';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import { createProjectile } from './Projectile';
import { advanceProjectile } from './projectilePhysics';

export interface TrajectoryPreview {
  points: Vec2[];
  impact: Vec2 | null;
  flightSeconds: number;
}

export function simulateTrajectoryPreview(
  cannon: CannonState,
  terrain: TerrainGrid,
  config: GameConfig,
): TrajectoryPreview {
  const projectile = createProjectile(cannon, config, -1, 0);
  const dt = 1 / config.simulation.tickRate;
  const maxTicks = Math.ceil(
    Math.min(config.preview.maxSeconds, projectile.maxLifetimeSeconds) / dt,
  );
  const stride = Math.max(1, Math.ceil(maxTicks / (config.preview.maxPoints - 1)));
  const points = [{ ...projectile.position }];
  let impact: Vec2 | null = null;
  for (let tick = 1; tick <= maxTicks && projectile.alive; tick++) {
    const hit = advanceProjectile(projectile, terrain, config, dt);
    if (hit) impact = hit.position;
    if (tick % stride === 0 || !projectile.alive || tick === maxTicks)
      points.push({ ...projectile.position });
  }
  return { points, impact, flightSeconds: projectile.lifetimeSeconds };
}
