import type { GameState } from './GameState';

/** Explicit, on-demand boundary; never JSON-clone state in the frame loop. */
export function createGameSnapshot(state: Readonly<GameState>) {
  return {
    tick: state.tick,
    elapsedSeconds: state.elapsedSeconds,
    seed: state.seed,
    nextEntityId: state.nextEntityId,
    cannon: { ...state.cannon, position: { ...state.cannon.position } },
    projectiles: state.projectiles.map((p) => ({
      ...p,
      position: { ...p.position },
      previousPosition: { ...p.previousPosition },
      velocity: { ...p.velocity },
    })),
    terrain: {
      columns: state.terrain.columns,
      rows: state.terrain.rows,
      cellSizeMeters: state.terrain.cellSizeMeters,
      version: state.terrain.version,
      cells: Array.from(state.terrain.cells),
    },
    shotsFired: state.shotsFired,
    lastImpact: state.lastImpact
      ? {
          ...state.lastImpact,
          position: { ...state.lastImpact.position },
          damage: { ...state.lastImpact.damage, center: { ...state.lastImpact.damage.center } },
        }
      : null,
  };
}
