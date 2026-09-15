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
import { spawnTarget, type UnitState } from '../entities/UnitState';
import type { EntityImpactEvent } from '../combat/EntityImpactEvent';
import type { EntityDamageEvent } from '../combat/EntityDamageEvent';
import type { HealthChange } from '../combat/applyEntityDamage';
import { refreshUnitGrounding } from '../movement/terrainGrounding';

export interface LastEntityImpact extends EntityImpactEvent, HealthChange {
  damage: number;
}

/** Persistent telemetry, separate from the transient event queue. */
export interface LastImpact extends ImpactEvent {
  result: ImpactResolution['type'];
  impactAngleRad: number;
  ricochetCount: number;
  maxRicochets: number;
  energyRetention: number;
  craterRadiusMeters: number;
  removedCells: number;
  materialId: TerrainMaterialId;
  penetrationStatus: 'penetrating' | 'success' | 'stopped' | 'disabled' | 'notAttempted';
  penetrationDistanceMeters: number;
  energyLostJ: number;
  remainingEnergyJ: number;
  exitSpeed: number;
}
export type SimulationEvent =
  | EntityImpactEvent
  | EntityDamageEvent
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
  units: UnitState[];
  lastEntityImpact: LastEntityImpact | null;
  projectiles: ProjectileState[];
  terrain: TerrainGrid;
  lastImpact: LastImpact | null;
  events: SimulationEvent[];
  shotsFired: number;
}

export function createGameState(config: GameConfig, seed: number): GameState {
  const terrain = generateTerrain(config, seed);
  const cannon = spawnCannon(terrain, config);
  const units = [cannon, spawnTarget(terrain, 2)];
  for (const unit of units) refreshUnitGrounding(unit, terrain);
  cannon.surfaceY = cannon.position.y + cannon.hitbox.radiusMeters;
  return {
    tick: 0,
    elapsedSeconds: 0,
    seed: seed >>> 0,
    nextEntityId: 3,
    cannon,
    units,
    lastEntityImpact: null,
    projectiles: [],
    terrain,
    lastImpact: null,
    events: [],
    shotsFired: 0,
  };
}
