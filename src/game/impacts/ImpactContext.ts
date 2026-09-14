import { normalize, type Vec2 } from '../math/Vec2';
import {
  terrainMaterialDefinitions,
  type TerrainMaterialDefinition,
} from '../terrain/TerrainMaterialDefinition';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import { impactMaterial } from './resolvePenetration';
import { calculateImpactAngle } from './calculateImpactAngle';
import type { ImpactEvent } from './ImpactEvent';

export interface ImpactContext {
  event: ImpactEvent;
  material: TerrainMaterialDefinition;
  incomingDirection: Vec2;
  surfaceNormal: Vec2;
  impactAngleRad: number;
}

export function createImpactContext(
  event: ImpactEvent,
  radius: number,
  terrain: TerrainGrid,
): ImpactContext {
  const surfaceNormal = normalize(event.surfaceNormal, {
    x: -event.velocity.x,
    y: -event.velocity.y,
  });
  const incomingDirection = normalize(event.velocity, { x: -surfaceNormal.x, y: -surfaceNormal.y });
  return {
    event,
    material: terrainMaterialDefinitions[impactMaterial(terrain, event.position, radius)],
    incomingDirection,
    surfaceNormal,
    impactAngleRad: calculateImpactAngle(incomingDirection, surfaceNormal),
  };
}
