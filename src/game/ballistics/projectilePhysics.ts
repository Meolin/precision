import type { GameConfig } from '../config/GameConfig';
import { lengthSquared, type Vec2 } from '../math/Vec2';
import { sweepTerrain, type TerrainHit } from '../terrain/terrainCollision';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import type { ProjectileState } from './Projectile';

export const kineticEnergy = (massKg: number, velocity: Vec2): number =>
  0.5 * massKg * lengthSquared(velocity);

/** Semi-implicit Euler; exponential linear drag in s^-1 cannot reverse velocity. */
export function stepProjectile(
  projectile: ProjectileState,
  physics: GameConfig['physics'],
  dt: number,
): void {
  projectile.previousPosition = { ...projectile.position };
  const retention = Math.exp(-physics.airDrag * dt);
  projectile.velocity.x = (projectile.velocity.x + physics.windAcceleration * dt) * retention;
  projectile.velocity.y = (projectile.velocity.y + physics.gravity * dt) * retention;
  projectile.position.x += projectile.velocity.x * dt;
  projectile.position.y += projectile.velocity.y * dt;
  projectile.lifetimeSeconds += dt;
}

/** Shared by the live simulation and preview, including all stop conditions. */
export function advanceProjectile(
  projectile: ProjectileState,
  terrain: TerrainGrid,
  config: GameConfig,
  dt: number,
  samples?: Vec2[],
): TerrainHit | null {
  stepProjectile(projectile, config.physics, dt);
  const hit = sweepTerrain(
    terrain,
    projectile.previousPosition,
    projectile.position,
    projectile.radius,
    samples,
  );
  if (hit) {
    projectile.position = hit.position;
    projectile.alive = false;
    return hit;
  }
  const { x, y } = projectile.position;
  // Top is open: a shell can leave the visible sky and fall back onto the map.
  if (
    x < -projectile.radius ||
    x > config.world.widthMeters + projectile.radius ||
    y > config.world.heightMeters + projectile.radius ||
    projectile.lifetimeSeconds >= projectile.maxLifetimeSeconds
  )
    projectile.alive = false;
  return null;
}
