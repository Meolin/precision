import type { ProjectileState } from '../ballistics/Projectile';
import type { GameConfig } from '../config/GameConfig';
import type { InstallationState } from '../entities/InstallationState';
import type { EntityId } from '../math/Vec2';
import type { ImpactEvent } from '../impacts/ImpactEvent';
import type { TerrainDamageEvent } from '../terrain/TerrainDamageEvent';
import { generateTerrain } from '../terrain/generateTerrain';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import type { TerrainMaterialId } from '../terrain/TerrainMaterialId';
import type { ImpactResolution } from '../impacts/ImpactResolution';
import type { UnitState } from '../entities/UnitState';
import type { EntityImpactEvent } from '../combat/EntityImpactEvent';
import type { EntityDamageEvent } from '../combat/EntityDamageEvent';
import type { HealthChange } from '../combat/applyEntityDamage';
import { spawnInstallations } from '../entities/spawnInstallations';
import type { ExplosionEvent } from '../explosions/ExplosionEvent';
import type { ExplosionResolvedEvent } from '../explosions/resolveExplosion';
import type { FallingTerrainCluster, PendingTerrainSettling } from '../terrain/terrainSettling';

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
  | ExplosionEvent
  | ExplosionResolvedEvent
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
  /** Compatibility alias for installation #1; group commands always resolve units by ID. */
  cannon: InstallationState;
  units: UnitState[];
  lastEntityImpact: LastEntityImpact | null;
  projectiles: ProjectileState[];
  terrain: TerrainGrid;
  pendingTerrainSettling: PendingTerrainSettling[];
  fallingTerrain: FallingTerrainCluster[];
  lastImpact: LastImpact | null;
  events: SimulationEvent[];
  shotsFired: number;
}

export function createGameState(config: GameConfig, seed: number): GameState {
  const terrain = generateTerrain(config, seed);
  const units = spawnInstallations(terrain, config);
  const cannon = units[0]!;
  return {
    tick: 0,
    elapsedSeconds: 0,
    seed: seed >>> 0,
    nextEntityId: units.length + 1,
    cannon,
    units,
    lastEntityImpact: null,
    projectiles: [],
    terrain,
    pendingTerrainSettling: [],
    fallingTerrain: [],
    lastImpact: null,
    events: [],
    shotsFired: 0,
  };
}
