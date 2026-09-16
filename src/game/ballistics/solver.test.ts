import { describe, expect, it } from 'vitest';
import { cloneConfig } from '../config/defaultGameConfig';
import { createGameState } from '../core/GameState';
import { createGameSnapshot } from '../core/GameSnapshot';
import { refreshUnitGrounding } from '../movement/terrainGrounding';
import { TerrainGrid } from '../terrain/TerrainGrid';
import { toRadians } from '../math/Vec2';
import { createProjectile } from './Projectile';
import { advanceProjectile } from './projectilePhysics';
import { solveBallisticAim } from './solveBallisticAim';

describe('bounded solver uses real projectile physics', () => {
  it.each([
    { gravity: 9.81, windAcceleration: 0, airDrag: 0 },
    { gravity: 9.81, windAcceleration: -2, airDrag: 0.08 },
  ])('reaches a sampled trajectory point with $windAcceleration wind and $airDrag drag without mutating state', (physics) => {
    const config = cloneConfig();
    const state = createGameState(config, 12345);
    state.terrain = new TerrainGrid(600, 320, 0.2);
    config.physics = physics;
    state.cannon.position = { x: 10, y: 40 };
    state.cannon.angleRad = toRadians(45);
    const probe = createProjectile(state.cannon, config, -1, 0);
    for (let tick = 0; tick < 90; tick++) advanceProjectile(probe, state.terrain, config, 1 / 60, undefined, [state.cannon]);
    const target = { ...probe.position };
    const before = createGameSnapshot(state);
    const solution = solveBallisticAim(state.cannon, target, state.terrain, config, [state.cannon]);
    expect(solution).not.toBeNull();
    expect(solution!.missDistanceMeters).toBeLessThanOrEqual(config.rts.solverToleranceMeters);
    expect(solveBallisticAim(state.cannon, target, state.terrain, config, [state.cannon])).toEqual(solution);
    expect(createGameSnapshot(state)).toEqual(before);
    const live = createProjectile({ ...state.cannon, angleRad: solution!.angleRad }, config, 999, 0);
    let nearest = Infinity;
    for (let tick = 0; tick < 1200 && live.alive; tick++) {
      const hit = advanceProjectile(live, state.terrain, config, 1 / 60, undefined, [state.cannon]);
      nearest = Math.min(nearest, Math.hypot(live.position.x - target.x, live.position.y - target.y));
      if (hit) break;
    }
    expect(nearest).toBeLessThan(config.rts.solverToleranceMeters + 0.5);
  });

  it('finds a left-facing direct hit and refuses terrain-blocked targets', () => {
    const config = cloneConfig();
    config.rts.installationsPerPlayer = 1;
    const state = createGameState(config, 12345);
    state.terrain = new TerrainGrid(600, 320, 0.2);
    for (let column = 0; column < 600; column++)
      for (let row = 200; row < 320; row++) state.terrain.setSolid(column, row, true);
    state.cannon.position.x = 60;
    state.cannon.grounding.terrainVersion = -1;
    refreshUnitGrounding(state.cannon, state.terrain);
    const target = state.units[1]!;
    target.position = { x: 20, y: state.cannon.position.y };
    const solution = solveBallisticAim(state.cannon, target.position, state.terrain, config, state.units, target.id);
    expect(solution).not.toBeNull();
    expect(solution!.angleRad).toBeGreaterThan(Math.PI / 2);
    // A wall reaching above every possible apex for this weapon at the current gravity.
    for (let row = 0; row < 320; row++) state.terrain.setSolid(200, row, true);
    config.physics.gravity = 40;
    expect(solveBallisticAim(state.cannon, target.position, state.terrain, config, state.units, target.id)).toBeNull();
  });
});
