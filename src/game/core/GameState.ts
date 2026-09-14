import type { ProjectileState } from '../ballistics/Projectile';
import type { GameConfig } from '../config/GameConfig';
import { spawnCannon, type CannonState } from '../entities/Cannon';
import type { EntityId } from '../math/Vec2';
import type { ImpactEvent } from '../impacts/ImpactEvent';
import type { TerrainDamageEvent } from '../terrain/TerrainDamageEvent';
import { generateTerrain } from '../terrain/generateTerrain';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import type { TerrainMaterialId } from '../terrain/TerrainMaterialId';
import type { ImpactResolution } from '../impacts/ImpactResolution';

/** Persistent telemetry, separate from the transient event queue. */
export interface LastImpact extends ImpactEvent {
  craterRadiusMeters: number;
  removedCells: number;
  materialId: TerrainMaterialId;
  penetrationStatus: 'penetrating' | 'success' | 'stopped' | 'disabled';
  penetrationDistanceMeters: number;
  energyLostJ: number;
  remainingEnergyJ: number;
  exitSpeed: number;
}
export type SimulationEvent =
  | ImpactEvent
  | TerrainDamageEvent
  | { type: 'impactResolved'; tick: number; projectileId: EntityId; resolution: ImpactResolution }
  | { type: 'projectileSpawned'; tick: number; projectile: ProjectileState };
export interface GameState {
  tick: number;
  elapsedSeconds: number;
  seed: number;
  nextEntityId: EntityId;
  cannon: CannonState;
  projectiles: ProjectileState[];
  terrain: TerrainGrid;
  lastImpact: LastImpact | null;
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
