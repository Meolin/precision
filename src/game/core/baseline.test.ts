import { describe, expect, it } from 'vitest';
import { cloneConfig } from '../config/defaultGameConfig';
import { toRadians } from '../math/Vec2';
import { GameRuntime } from './GameRuntime';
import { spawnCannon } from '../entities/Cannon';

// Captured from ballistic-mvp-v1 BEFORE the weapon/impact migration.
// Keep these snapshots fixed: they protect integration, contact and destruction.
describe('ballistic MVP baseline', () => {
  it.each([
    { name: 'default', angle: 42, wind: 0, drag: 0 },
    { name: 'wind and drag', angle: 58, wind: -2, drag: 0.08 },
    { name: 'low angle', angle: 12, wind: 1, drag: 0 },
    { name: 'high angle', angle: 80, wind: 0, drag: 0.15 },
  ])('$name', ({ angle, wind, drag }) => {
    const config = cloneConfig();
    // The unchanged Step 1/2 snapshots describe the all-Soil fixture.
    config.terrain.rockDepthMeters = null;
    config.physics.windAcceleration = wind;
    config.physics.airDrag = drag;
    const runtime = new GameRuntime(config);
    // Preserve the original launch pose for the immutable ballistic snapshots.
    // Step 5 grounding deliberately raises a full circle clear of adjacent cells.
    Object.assign(runtime.getState().cannon, spawnCannon(runtime.getState().terrain, config));
    delete runtime.getState().cannon.movement;
    runtime.enqueueCommand({ type: 'setAim', cannonId: 1, angleRad: toRadians(angle) });
    runtime.advance(1000 / 60);
    const preview = runtime.getTrajectoryPreview();
    runtime.enqueueCommand({ type: 'fire', cannonId: 1 });
    for (let tick = 0; tick < 1200 && !runtime.getState().lastImpact; tick++)
      runtime.advance(1000 / 60);
    const state = runtime.getState();
    expect(state.lastImpact).not.toBeNull();
    expect({
      preview,
      tick: state.lastImpact?.tick,
      position: state.lastImpact?.position,
      energy: state.lastImpact?.kineticEnergyJ,
      radius: state.lastImpact?.craterRadiusMeters,
      removedCells: state.lastImpact?.removedCells,
      terrainVersion: state.terrain.version,
      terrainChecksum: state.terrain.cells.reduce((sum, cell, index) => sum + cell * index, 0),
    }).toMatchSnapshot();
  });
});
