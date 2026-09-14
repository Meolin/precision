import { describe, expect, it } from 'vitest';
import { TerrainGrid } from '../terrain/TerrainGrid';
import { TerrainMaterialId as Material } from '../terrain/TerrainMaterialId';
import { terrainMaterialDefinitions } from '../terrain/TerrainMaterialDefinition';
import { calculateKineticEnergy } from '../ballistics/projectilePhysics';
import {
  resolvePenetration,
  MAX_PENETRATION_SAMPLES,
  type PenetrationInput,
} from './resolvePenetration';

function wall(material: Material = Material.Soil, thickness = 3): TerrainGrid {
  const terrain = new TerrainGrid(30, 6, 1);
  for (let x = 3; x < 3 + thickness; x++)
    for (let y = 0; y < 6; y++) terrain.setMaterial(x, y, material);
  return terrain;
}

function input(terrain = wall()): PenetrationInput {
  return {
    terrain,
    entryPosition: { x: 3, y: 2.5 },
    velocity: { x: 100, y: 0 },
    initialEnergyJ: 10000,
    massKg: 2,
    radiusMeters: 0,
    definition: {
      enabled: true,
      penetrationPower: 4,
      penetrationRadiusMeters: 0.18,
      maxPenetrationDistanceMeters: 20,
      minimumExitEnergyJ: 10,
    },
  };
}

describe('penetration traversal', () => {
  it('exits Soil, loses energy and preserves its direction with sqrt(2E/m) speed', () => {
    const request = input();
    const before = request.terrain.cells.slice();
    const result = resolvePenetration(request);
    expect(result.penetrated).toBe(true);
    expect(result.reason).toBe('exited');
    expect(result.penetrationDistanceMeters).toBeCloseTo(3);
    expect(result.remainingEnergyJ).toBeCloseTo(10000 - (1500 * 3) / 4);
    expect(result.remainingVelocity.y).toBe(0);
    expect(result.remainingVelocity.x).toBeCloseTo(
      Math.sqrt((2 * result.remainingEnergyJ) / request.massKg),
    );
    expect(calculateKineticEnergy(request.massKg, result.remainingVelocity)).toBeCloseTo(
      result.remainingEnergyJ,
    );
    expect(result.exitPosition!.x).toBeGreaterThan(6);
    expect(request.terrain.cells).toEqual(before);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('travels deeper in Soil than Rock with the same projectile and thickness', () => {
    const soil = input(wall(Material.Soil, 20));
    const rock = input(wall(Material.Rock, 20));
    soil.initialEnergyJ = rock.initialEnergyJ = 2000;
    const first = resolvePenetration(soil);
    const second = resolvePenetration(rock);
    expect(first.penetrated).toBe(false);
    expect(second.penetrated).toBe(false);
    expect(first.penetrationDistanceMeters).toBeGreaterThan(second.penetrationDistanceMeters);
    expect(second.finalPosition.x).toBeLessThan(23);
  });

  it('preserves an oblique direction after exiting a wall', () => {
    const result = resolvePenetration({
      ...input(),
      entryPosition: { x: 3, y: 1 },
      velocity: { x: 60, y: 80 },
    });
    expect(result.penetrated).toBe(true);
    expect(result.remainingVelocity.x / result.remainingVelocity.y).toBeCloseTo(60 / 80);
    expect(result.remainingVelocity.x).toBeGreaterThan(0);
    expect(result.remainingVelocity.y).toBeGreaterThan(0);
  });

  it('charges Soil → Rock → Soil independently, including exact material costs', () => {
    const terrain = wall();
    for (let row = 0; row < terrain.rows; row++) terrain.setMaterial(4, row, Material.Rock);
    const result = resolvePenetration(input(terrain));
    expect(result.penetrated).toBe(true);
    expect(result.remainingEnergyJ).toBeCloseTo(10000 - (1500 + 12000 + 1500) / 4);
    expect(result.traversedSegments.map((segment) => segment.materialId)).toEqual([
      Material.Soil,
      Material.Soil,
      Material.Rock,
      Material.Rock,
      Material.Soil,
      Material.Soil,
    ]);
    for (const segment of result.traversedSegments) {
      expect(segment.distanceMeters).toBeLessThanOrEqual(terrain.cellSizeMeters / 2);
      expect(segment.energyLostJ).toBeCloseTo(
        (terrainMaterialDefinitions[segment.materialId].penetrationResistance *
          segment.distanceMeters) /
          4,
      );
    }
    expect(result.initialEnergyJ - result.remainingEnergyJ).toBeCloseTo(
      result.traversedSegments.reduce((sum, segment) => sum + segment.energyLostJ, 0),
    );
  });

  it('higher power and thinner material leave more exit energy', () => {
    const request = input();
    const base = resolvePenetration(request);
    const stronger = resolvePenetration({
      ...request,
      definition: { ...request.definition, penetrationPower: 8 },
    });
    const thinner = resolvePenetration(input(wall(Material.Soil, 1)));
    expect(stronger.remainingEnergyJ).toBeGreaterThan(base.remainingEnergyJ);
    expect(thinner.remainingEnergyJ).toBeGreaterThan(base.remainingEnergyJ);
  });

  it('stops partway through a step when energy reaches the exit threshold', () => {
    const request = input();
    request.initialEnergyJ = 100;
    const result = resolvePenetration(request);
    expect(result.penetrated).toBe(false);
    expect(result.reason).toBe('energy');
    expect(result.exitPosition).toBeUndefined();
    expect(result.penetrationDistanceMeters).toBeCloseTo((100 - 10) / (1500 / 4));
    expect(result.finalPosition.x).toBeCloseTo(3.24);
    expect(result.remainingEnergyJ).toBeCloseTo(10);
    expect(result.remainingVelocity).toEqual({ x: 0, y: 0 });
  });

  it('enforces the maximum depth even at huge energy', () => {
    const request = input(wall(Material.Rock, 20));
    request.initialEnergyJ = 1e12;
    const result = resolvePenetration({
      ...request,
      definition: { ...request.definition, maxPenetrationDistanceMeters: 0.75 },
    });
    expect(result.reason).toBe('maxDistance');
    expect(result.penetrated).toBe(false);
    expect(result.penetrationDistanceMeters).toBe(0.75);
    expect(result.finalPosition.x).toBe(3.75);
  });

  it('has a hard sample bound even with a tiny grid and oversized depth budget', () => {
    const terrain = new TerrainGrid(6000, 1, 0.0001, new Uint8Array(6000).fill(Material.Soil));
    const request = input(terrain);
    request.entryPosition = { x: 0.00005, y: 0.00005 };
    request.initialEnergyJ = 1e12;
    const result = resolvePenetration(request);
    expect(result.reason).toBe('sampleLimit');
    expect(result.traversedSegments).toHaveLength(MAX_PENETRATION_SAMPLES);
    expect(result.penetrated).toBe(false);
  });

  it.each([-100, 0, 1, 10, 10.001, 100, 1e12, NaN, Infinity])(
    'never produces negative or nonfinite energy from %s',
    (energy) => {
      const result = resolvePenetration({ ...input(), initialEnergyJ: energy });
      expect(Number.isFinite(result.remainingEnergyJ)).toBe(true);
      expect(result.remainingEnergyJ).toBeGreaterThanOrEqual(0);
      expect(result.remainingEnergyJ).toBeLessThanOrEqual(result.initialEnergyJ);
    },
  );

  it('rejects invalid power, mass, direction and an entry in empty air', () => {
    const request = input();
    expect(resolvePenetration({ ...request, massKg: 0 }).reason).toBe('invalidInput');
    expect(resolvePenetration({ ...request, velocity: { x: 0, y: 0 } }).reason).toBe(
      'invalidInput',
    );
    expect(
      resolvePenetration({ ...request, definition: { ...request.definition, penetrationPower: 0 } })
        .reason,
    ).toBe('invalidInput');
    expect(resolvePenetration({ ...request, entryPosition: { x: 0, y: 2.5 } }).reason).toBe(
      'noContact',
    );
  });
});
