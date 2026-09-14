import type { ProjectileState } from '../ballistics/Projectile';
import type { GameConfig } from '../config/GameConfig';
import { spawnCannon, type CannonState } from '../entities/Cannon';
import type { EntityId, Vec2 } from '../math/Vec2';
import type { TerrainDamageOperation } from '../terrain/damageTerrain';
import { generateTerrain } from '../terrain/generateTerrain';
import type { TerrainGrid } from '../terrain/TerrainGrid';

export interface ImpactEvent {
  type: 'impact';
  tick: number;
  projectileId: EntityId;
  position: Vec2;
  energyJoules: number;
  damage: TerrainDamageOperation;
  removedCells: number;
}
export type SimulationEvent =
  ImpactEvent | { type: 'projectileSpawned'; tick: number; projectile: ProjectileState };
export interface GameState {
  tick: number;
  elapsedSeconds: number;
  seed: number;
  nextEntityId: EntityId;
  cannon: CannonState;
  projectiles: ProjectileState[];
  terrain: TerrainGrid;
  lastImpact: ImpactEvent | null;
  events: SimulationEvent[];
  shotsFired: number;
}

export function createGameState(config: GameConfig, seed: number): GameState {
  const terrain = generateTerrain(config, seed);
  return {
    tick: 0,
    elapsedSeconds: 0,
    seed: seed >>> 0,
    nextEntityId: 2,
    cannon: spawnCannon(terrain, config),
    projectiles: [],
    terrain,
    lastImpact: null,
    events: [],
    shotsFired: 0,
  };
}
