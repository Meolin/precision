import type { EntityId } from '../math/Vec2';
import type { TerrainHit } from '../terrain/terrainCollision';
import type { TerrainMaterialId } from '../terrain/TerrainMaterialId';
import type { SegmentIntersection } from './segmentCircleIntersection';
import type { Vec2 } from '../math/Vec2';

export interface TerrainCollisionCandidate extends TerrainHit {
  type: 'terrain';
  materialId: TerrainMaterialId;
}

export interface EntityCollisionCandidate extends SegmentIntersection {
  type: 'entity';
  entityId: EntityId;
}

export interface BodyCollisionCandidate extends SegmentIntersection {
  type: 'body';
  bodyId: EntityId;
  contactPoint: Vec2;
  bodyCenterAtContact: Vec2;
}

export type ProjectileCollisionCandidate =
  TerrainCollisionCandidate | EntityCollisionCandidate | BodyCollisionCandidate;
export type ProjectileCollisionResult = ProjectileCollisionCandidate;
