import type { GameConfig } from '../config/GameConfig';
import { lengthSquared, type Vec2 } from '../math/Vec2';
import { sweepTerrain, type TerrainHit } from '../terrain/terrainCollision';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import type { ProjectileState } from './Projectile';
import type { UnitState } from '../entities/UnitState';
import type { ProjectileCollisionResult } from '../collision/ProjectileCollisionResult';
import { queryProjectileCollision } from '../collision/queryProjectileCollision';
import { updateOwnerExclusion } from '../collision/entityCollision';

export const calculateKineticEnergy = (massKg: number, velocity: Vec2): number =>
  0.5 * massKg * lengthSquared(velocity);

/** Semi-implicit Euler; exponential linear drag in s^-1 cannot reverse velocity. */
export function stepProjectile(
  projectile: ProjectileState,
  physics: GameConfig['physics'],
  dt: number,
): void {
  projectile.previousPosition = { ...projectile.position };
  const retention = Math.exp(-physics.airDrag * projectile.dragCoefficient * dt);
  projectile.velocity.x =
    (projectile.velocity.x + physics.windAcceleration * projectile.windInfluence * dt) * retention;
  projectile.velocity.y =
    (projectile.velocity.y + physics.gravity * projectile.gravityScale * dt) * retention;
  projectile.position.x += projectile.velocity.x * dt;
  projectile.position.y += projectile.velocity.y * dt;
  projectile.lifetimeSeconds += dt;
}

/** Shared flight and contact query. The impact resolver owns collision response. */
export function advanceProjectile(
  projectile: ProjectileState,
  terrain: TerrainGrid,
  config: GameConfig,
  dt: number,
  samples?: Vec2[],
): TerrainHit | null;
export function advanceProjectile(
  projectile: ProjectileState,
  terrain: TerrainGrid,
  config: GameConfig,
  dt: number,
  samples: Vec2[] | undefined,
  units: readonly UnitState[],
): ProjectileCollisionResult | null;
export function advanceProjectile(
  projectile: ProjectileState,
  terrain: TerrainGrid,
  config: GameConfig,
  dt: number,
  samples?: Vec2[],
  units?: readonly UnitState[],
): TerrainHit | ProjectileCollisionResult | null {
  if (units) updateOwnerExclusion(projectile, units);
  stepProjectile(projectile, config.physics, dt);
  const hit = units
    ? queryProjectileCollision(projectile, terrain, units, samples)
    : sweepTerrain(
        terrain,
        projectile.previousPosition,
        projectile.position,
        projectile.radius,
        samples,
      );
  if (hit) {
    projectile.position = hit.position;
    if (units) updateOwnerExclusion(projectile, units);
    return hit;
  }
  if (units) updateOwnerExclusion(projectile, units);
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
