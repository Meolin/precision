import { describe, expect, it } from 'vitest';
import { cloneConfig } from '../config/defaultGameConfig';
import { createGameState } from '../core/GameState';
import { stepSimulation } from '../core/stepSimulation';
import { isInstallation } from '../entities/InstallationState';
import { hitboxCenter } from '../entities/Hitbox';
import { circleTouchesTerrain } from '../terrain/terrainCollision';
import { TerrainGrid } from '../terrain/TerrainGrid';
import { queryUnitGrounding, refreshUnitGrounding } from './terrainGrounding';

describe('stationary installations and support', () => {
  it('spawns four installations per owner without terrain or entity overlap', () => {
    const config = cloneConfig();
    const state = createGameState(config, 12345);
    expect(state.units.filter((unit) => unit.ownerPlayerId === 1)).toHaveLength(4);
    expect(state.units.filter((unit) => unit.ownerPlayerId === 2)).toHaveLength(4);
    for (const unit of state.units) {
      expect(unit.movement).toBeUndefined();
      expect(unit.mobilityType).toBe('stationary');
      expect(
        circleTouchesTerrain(
          state.terrain,
          hitboxCenter(unit.position, unit.hitbox),
          unit.hitbox.radiusMeters,
        ),
      ).toBe(false);
      for (const other of state.units)
        if (other.id !== unit.id)
          expect(
            Math.hypot(unit.position.x - other.position.x, unit.position.y - other.position.y),
          ).toBeGreaterThan(unit.hitbox.radiusMeters + other.hitbox.radiusMeters);
    }
    const initialX = state.units.map((unit) => unit.position.x);
    stepSimulation(state, config, 1);
    expect(state.units.map((unit) => unit.position.x)).toEqual(initialX);
  });

  it('settles vertically into a crater and reports missing support without moving X', () => {
    const config = cloneConfig();
    const state = createGameState(config, 12345);
    const unit = state.cannon;
    const initial = { ...unit.position };
    state.terrain.removeCircle({ x: initial.x, y: unit.surfaceY }, 5);
    stepSimulation(state, config, 1 / 60);
    expect(unit.position.x).toBe(initial.x);
    expect(unit.position.y).toBeGreaterThan(initial.y);
    expect(circleTouchesTerrain(state.terrain, unit.position, unit.hitbox.radiusMeters)).toBe(
      false,
    );
    state.terrain = new TerrainGrid(120, 64, 1);
    unit.grounding.terrainVersion = -1;
    refreshUnitGrounding(unit, state.terrain);
    expect(unit.grounding.grounded).toBe(false);
    expect(Number.isFinite(unit.position.y)).toBe(true);
    expect(unit.position.x).toBe(initial.x);
  });

  it('accounts for offset circles and updates all installations after terrain changes', () => {
    const config = cloneConfig();
    const state = createGameState(config, 12345);
    state.cannon.hitbox.offset = { x: 0.5, y: -0.5 };
    const result = queryUnitGrounding(state.terrain, state.cannon, state.cannon.position.x);
    expect(
      circleTouchesTerrain(
        state.terrain,
        hitboxCenter(result.position, state.cannon.hitbox),
        state.cannon.hitbox.radiusMeters,
      ),
    ).toBe(false);
    state.terrain.removeCircle({ x: 70, y: 45 }, 4);
    stepSimulation(state, config, 1 / 60);
    for (const unit of state.units.filter(isInstallation))
      expect(unit.grounding.terrainVersion).toBe(state.terrain.version);
  });
});
