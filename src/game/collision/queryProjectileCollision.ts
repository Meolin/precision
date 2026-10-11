import type { ProjectileState } from '../ballistics/Projectile';
import type { UnitState } from '../entities/UnitState';
import type { Vec2 } from '../math/Vec2';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import { findTerrainContactCell, sweepTerrain } from '../terrain/terrainCollision';
import { entityCollisionCandidates } from './entityCollision';
import type { BodyState } from '../physics/Body';
import { projectileBodyCollisionCandidates } from './projectileBodyCollision';
import type {
  BodyCollisionCandidate,
  EntityCollisionCandidate,
  ProjectileCollisionCandidate,
  ProjectileCollisionResult,
} from './ProjectileCollisionResult';

const collisionId = (candidate: ProjectileCollisionCandidate): number =>
  candidate.type === 'body'
    ? candidate.bodyId
    : candidate.type === 'entity'
      ? candidate.entityId
      : 0;

/** Obstacle sweep used while a shell is already traversing solid terrain. */
export function queryProjectileObstacleCollision(
  projectile: ProjectileState,
  units: readonly UnitState[],
  bodies: readonly BodyState[] = [],
): BodyCollisionCandidate | EntityCollisionCandidate | null {
  const candidates: (BodyCollisionCandidate | EntityCollisionCandidate)[] = [
    ...entityCollisionCandidates(
      projectile,
      units,
      projectile.previousPosition,
      projectile.position,
    ),
    ...projectileBodyCollisionCandidates(projectile, bodies),
  ];
  candidates.sort((a, b) => a.fraction - b.fraction || collisionId(a) - collisionId(b));
  return candidates[0] ?? null;
}

/** Fractions share the same full flight segment. Terrain wins an exact tie;
 * overlapping entities use their stable ID, independent of collection order. */
export function queryProjectileCollision(
  projectile: ProjectileState,
  terrain: TerrainGrid,
  units: readonly UnitState[],
  samples?: Vec2[],
  bodies: readonly BodyState[] = [],
): ProjectileCollisionResult | null {
  const from = projectile.previousPosition;
  const to = projectile.position;
  const candidates: ProjectileCollisionCandidate[] = entityCollisionCandidates(
    projectile,
    units,
    from,
    to,
  );
  candidates.push(...projectileBodyCollisionCandidates(projectile, bodies));
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
      (a.type === 'terrain' ? -1 : b.type === 'terrain' ? 1 : collisionId(a) - collisionId(b)),
  );
  return candidates[0] ?? null;
}
