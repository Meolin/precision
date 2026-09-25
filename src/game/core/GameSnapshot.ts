import type { GameState } from './GameState';
import { cloneUnit } from '../entities/UnitState';

/** Explicit, on-demand boundary; never JSON-clone state in the frame loop. */
export function createGameSnapshot(state: Readonly<GameState>) {
  return {
    tick: state.tick,
    elapsedSeconds: state.elapsedSeconds,
    seed: state.seed,
    nextEntityId: state.nextEntityId,
    cannon: cloneUnit(state.cannon),
    units: state.units.map(cloneUnit),
    lastEntityImpact: state.lastEntityImpact
      ? {
          ...state.lastEntityImpact,
          position: { ...state.lastEntityImpact.position },
          velocity: { ...state.lastEntityImpact.velocity },
          surfaceNormal: { ...state.lastEntityImpact.surfaceNormal },
        }
      : null,
    projectiles: state.projectiles.map((p) => ({
      ...p,
      position: { ...p.position },
      previousPosition: { ...p.previousPosition },
      velocity: { ...p.velocity },
      ricochet: { ...p.ricochet },
      ...(p.penetration ? { penetration: { ...p.penetration } } : {}),
      ...(p.penetrationState
        ? {
            penetrationState: {
              ...p.penetrationState,
              position: { ...p.penetrationState.position },
              direction: { ...p.penetrationState.direction },
              materialSamples: [...p.penetrationState.materialSamples],
            },
          }
        : {}),
    })),
    terrain: {
      columns: state.terrain.columns,
      rows: state.terrain.rows,
      cellSizeMeters: state.terrain.cellSizeMeters,
      version: state.terrain.version,
      cells: Array.from(state.terrain.cells),
      ...(state.terrain.initialSurfaceMeters
        ? { initialSurfaceMeters: [...state.terrain.initialSurfaceMeters] }
        : {}),
    },
    pendingTerrainSettling: state.pendingTerrainSettling.map((pending) => ({
      rect: { ...pending.rect },
      readyAtSeconds: pending.readyAtSeconds,
    })),
    fallingTerrain: state.fallingTerrain.map((cluster) => ({
      cells: cluster.cells.map((cell) => ({ ...cell })),
      elapsedSeconds: cluster.elapsedSeconds,
      durationSeconds: cluster.durationSeconds,
    })),
    shotsFired: state.shotsFired,
    lastImpact: state.lastImpact
      ? {
          ...state.lastImpact,
          position: { ...state.lastImpact.position },
          velocity: { ...state.lastImpact.velocity },
          contactPoint: { ...state.lastImpact.contactPoint },
          ...(state.lastImpact.surfaceNormal
            ? { surfaceNormal: { ...state.lastImpact.surfaceNormal } }
            : {}),
        }
      : null,
  };
}
