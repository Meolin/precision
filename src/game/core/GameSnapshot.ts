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
    },
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
