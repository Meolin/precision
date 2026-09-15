import type { GameConfig } from '../config/GameConfig';
import type { CannonState } from '../entities/Cannon';
import type { Vec2 } from '../math/Vec2';
import { TerrainGrid } from '../terrain/TerrainGrid';
import { createImpactEvent } from '../impacts/ImpactEvent';
import { resolveImpact } from '../impacts/resolveImpact';
import { resolveImpactDefinition } from '../impacts/impactDefinitions';
import { applyRicochetContinuation } from '../impacts/ricochetContinuation';
import { applyTerrainDamage } from '../terrain/damageTerrain';
import { createProjectile } from './Projectile';
import { advanceProjectile } from './projectilePhysics';
import type { UnitState } from '../entities/UnitState';

export interface TrajectoryPreview {
  points: Vec2[];
  impact: Vec2 | null;
  flightSeconds: number;
  ricochets?: Vec2[];
}

export const MAX_PREVIEW_RICOCHETS = 1;

export function simulateTrajectoryPreview(
  cannon: CannonState,
  terrain: TerrainGrid,
  config: GameConfig,
  units: readonly UnitState[] = [],
): TrajectoryPreview {
  if (!cannon.alive) return { points: [], impact: null, flightSeconds: 0 };
  const projectile = createProjectile(cannon, config, -1, 0);
  const dt = 1 / config.simulation.tickRate;
  const maxTicks = Math.ceil(
    Math.min(config.preview.maxSeconds, projectile.maxLifetimeSeconds) / dt,
  );
  const stride = Math.max(1, Math.ceil(maxTicks / (config.preview.maxPoints - 1)));
  const points = [{ ...projectile.position }];
  let impact: Vec2 | null = null;
  let previewTerrain = terrain;
  const ricochets: Vec2[] = [];
  for (let tick = 1; tick <= maxTicks && projectile.alive; tick++) {
    const hit = advanceProjectile(projectile, previewTerrain, config, dt, undefined, units);
    if (hit) {
      if (hit.type === 'entity') {
        impact = { ...hit.position };
        points.push({ ...hit.position });
        projectile.alive = false;
        break;
      }
      const resolution = resolveImpact(
        createImpactEvent(projectile, hit, tick - 1),
        resolveImpactDefinition(
          projectile.impactDefinitionId,
          config.weaponOverrides[projectile.weaponId]?.impact,
        ),
        projectile,
        previewTerrain,
      );
      if (resolution.type === 'ricochet' && ricochets.length < MAX_PREVIEW_RICOCHETS) {
        ricochets.push({ ...hit.position });
        points.push({ ...hit.position });
        // Copy only once, on a bounce. The live terrain and its version stay untouched.
        // Applying the same chip preserves collision geometry for subsequent flight.
        if (previewTerrain === terrain)
          previewTerrain = new TerrainGrid(
            terrain.columns,
            terrain.rows,
            terrain.cellSizeMeters,
            terrain.cells,
          );
        for (const damage of resolution.terrainDamageEvents)
          applyTerrainDamage(previewTerrain, damage);
        applyRicochetContinuation(projectile, resolution, config);
      } else {
        impact = { ...hit.position };
        // Penetration and a second contact terminate the bounded preview.
        projectile.alive = false;
      }
    }
    if (tick % stride === 0 || !projectile.alive || tick === maxTicks)
      points.push({ ...projectile.position });
  }
  return {
    points,
    impact,
    flightSeconds: projectile.lifetimeSeconds,
    ...(ricochets.length ? { ricochets } : {}),
  };
}
