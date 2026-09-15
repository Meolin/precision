import type { ProjectileState } from '../ballistics/Projectile';
import type { UnitState } from '../entities/UnitState';
import type { Vec2 } from '../math/Vec2';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import { findTerrainContactCell, sweepTerrain } from '../terrain/terrainCollision';
import { entityCollisionCandidates } from './entityCollision';
import type {
  ProjectileCollisionCandidate,
  ProjectileCollisionResult,
} from './ProjectileCollisionResult';

/** Fractions share the same full flight segment. Terrain wins an exact tie;
 * overlapping entities use their stable ID, independent of collection order. */
export function queryProjectileCollision(
  projectile: ProjectileState,
  terrain: TerrainGrid,
  units: readonly UnitState[],
  samples?: Vec2[],
): ProjectileCollisionResult | null {
  const from = projectile.previousPosition;
  const to = projectile.position;
  const candidates: ProjectileCollisionCandidate[] = entityCollisionCandidates(
    projectile,
    units,
    from,
    to,
  );
  const terrainHit = sweepTerrain(terrain, from, to, projectile.radius, samples);
  if (terrainHit) {
    const cell = findTerrainContactCell(terrain, terrainHit.position, projectile.radius)!;
    candidates.push({
      ...terrainHit,
      type: 'terrain',
      materialId: terrain.getMaterialAtCell(cell.x, cell.y),
    });
  }
  candidates.sort(
    (a, b) =>
      a.fraction - b.fraction ||
      (a.type === 'terrain' ? -1 : b.type === 'terrain' ? 1 : a.entityId - b.entityId),
  );
  return candidates[0] ?? null;
}
