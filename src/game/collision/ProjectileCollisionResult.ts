import type { EntityId } from '../math/Vec2';
import type { TerrainHit } from '../terrain/terrainCollision';
import type { TerrainMaterialId } from '../terrain/TerrainMaterialId';
import type { SegmentIntersection } from './segmentCircleIntersection';

export interface TerrainCollisionCandidate extends TerrainHit {
  type: 'terrain';
  materialId: TerrainMaterialId;
}

export interface EntityCollisionCandidate extends SegmentIntersection {
  type: 'entity';
  entityId: EntityId;
}

export type ProjectileCollisionCandidate = TerrainCollisionCandidate | EntityCollisionCandidate;
export type ProjectileCollisionResult = ProjectileCollisionCandidate;
