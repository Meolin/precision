import type { GameConfig } from '../config/GameConfig';
import { clamp, type Vec2 } from '../math/Vec2';
import type { TerrainGrid } from './TerrainGrid';

export interface TerrainDamageOperation {
  type: 'circle';
  center: Vec2;
  radius: number;
}

export function craterRadius(energyJoules: number, config: GameConfig['terrain']): number {
  return clamp(
    config.baseCraterRadiusMeters +
      Math.sqrt(Math.max(0, energyJoules)) * config.energyToCraterScale,
    config.baseCraterRadiusMeters,
    config.maxCraterRadiusMeters,
  );
}

export function applyTerrainDamage(
  terrain: TerrainGrid,
  operation: TerrainDamageOperation,
): number {
  return terrain.removeCircle(operation.center, operation.radius);
}
