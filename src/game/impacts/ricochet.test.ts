import { describe, expect, it } from 'vitest';
import { calculateKineticEnergy } from '../ballistics/projectilePhysics';
import { normalize, toRadians } from '../math/Vec2';
import { terrainMaterialDefinitions } from '../terrain/TerrainMaterialDefinition';
import { TerrainMaterialId as Material } from '../terrain/TerrainMaterialId';
import { calculateImpactAngle } from './calculateImpactAngle';
import type { ImpactContext } from './ImpactContext';
import type { ProjectileRicochetDefinition } from './ProjectileRicochetDefinition';
import { resolveRicochet } from './resolveRicochet';

const definition: ProjectileRicochetDefinition = {
  enabled: true,
  minRicochetAngleDeg: 65,
  minSpeedMetersPerSecond: 10,
  energyRetention: 0.6,
  maxRicochets: 2,
};

function contact(angle = 75, speed = 20, material: Material = Material.Rock): ImpactContext {
  const velocity = { x: Math.sin(toRadians(angle)) * speed, y: Math.cos(toRadians(angle)) * speed };
  const surfaceNormal = { x: 0, y: -1 };
  return {
    event: {
      type: 'projectileImpact',
      tick: 0,
      projectileId: 2,
      weaponId: 'basicCannon',
      projectileDefinitionId: 'basicShell',
      impactDefinitionId: 'basicImpact',
      position: { x: 5, y: 4 },
      contactPoint: { x: 5, y: 4 },
      surfaceNormal,
      velocity,
      speed,
      kineticEnergyJ: calculateKineticEnergy(5, velocity),
    },
    material: terrainMaterialDefinitions[material],
    incomingDirection: normalize(velocity),
    surfaceNormal,
    impactAngleRad: calculateImpactAngle(velocity, surfaceNormal),
  };
}

describe('deterministic ricochet decision', () => {
  it('rejects frontal/40 degree impacts and reflects a 75 degree impact', () => {
    for (const angle of [0, 40])
      expect(resolveRicochet(contact(angle), definition, 5, 0)).toMatchObject({
        ricocheted: false,
        reason: 'angle',
      });
    expect(resolveRicochet(contact(), definition, 5, 0).ricocheted).toBe(true);
  });

  it('uses the material factor: Rock bounces, Soil/Air do not', () => {
    expect(resolveRicochet(contact(), definition, 5, 0).ricocheted).toBe(true);
    for (const material of [Material.Soil, Material.Air])
      expect(resolveRicochet(contact(75, 20, material), definition, 5, 0)).toMatchObject({
        ricocheted: false,
        reason: 'material',
      });
    const soft = contact();
    soft.material = { ...soft.material, ricochetFactor: 0.2 };
    expect(resolveRicochet(soft, definition, 5, 0)).toMatchObject({
      ricocheted: false,
      reason: 'angle',
    });
  });

  it('retains 600 J of 1000 J and reconstructs a consistent outgoing velocity', () => {
    const context = contact();
    const before = JSON.stringify(context);
    const result = resolveRicochet(context, definition, 5, 0);
    expect(result.ricocheted).toBe(true);
    if (!result.ricocheted) throw new Error('Expected ricochet');
    expect(result.remainingEnergyJ).toBeCloseTo(600);
    expect(result.energyLostJ).toBeCloseTo(400);
    expect(result.outgoingVelocity.x).toBeGreaterThan(0);
    expect(result.outgoingVelocity.y).toBeLessThan(0);
    expect(Math.hypot(result.outgoingVelocity.x, result.outgoingVelocity.y)).toBeCloseTo(
      Math.sqrt((2 * 600) / 5),
    );
    expect(calculateKineticEnergy(5, result.outgoingVelocity)).toBeCloseTo(result.remainingEnergyJ);
    expect(result.outgoingVelocity.y / result.outgoingVelocity.x).toBeCloseTo(
      -context.event.velocity.y / context.event.velocity.x,
    );
    expect(JSON.stringify(context)).toBe(before);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(resolveRicochet(context, definition, 5, 0)).toEqual(result);
  });

  it('honors enabled, the speed floor, and the ricochet limit', () => {
    expect(resolveRicochet(contact(), { ...definition, enabled: false }, 5, 0)).toMatchObject({
      reason: 'disabled',
    });
    expect(resolveRicochet(contact(75, 9), definition, 5, 0)).toMatchObject({ reason: 'speed' });
    expect(resolveRicochet(contact(), { ...definition, maxRicochets: 1 }, 5, 1)).toMatchObject({
      reason: 'limit',
    });
    expect(resolveRicochet(contact(), definition, 5, 1).ricocheted).toBe(true);
    expect(resolveRicochet(contact(), definition, 5, 2)).toMatchObject({ reason: 'limit' });
  });

  it('stops an otherwise valid bounce if the retained energy cannot sustain minimum speed', () => {
    expect(resolveRicochet(contact(75, 11), definition, 5, 0)).toMatchObject({
      ricocheted: false,
      reason: 'exhausted',
    });
  });

  it('never reflects an already departing contact or an exact tangent', () => {
    for (const angle of [90, 100, 180])
      expect(resolveRicochet(contact(angle), definition, 5, 0)).toMatchObject({
        ricocheted: false,
        reason: 'separating',
      });
  });

  it.each([0, -1, 1, 2, NaN, Infinity])(
    'rejects non-dissipative or invalid retention %s',
    (energyRetention) => {
      const result = resolveRicochet(contact(), { ...definition, energyRetention }, 5, 0);
      expect(result).toMatchObject({ ricocheted: false, reason: 'invalidInput' });
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    },
  );

  it('rejects zero mass, malformed normals, speeds, energies and counters', () => {
    expect(resolveRicochet(contact(), definition, 0, 0)).toMatchObject({ reason: 'invalidInput' });
    for (const value of [-1, NaN, Infinity]) {
      const context = contact();
      context.event.kineticEnergyJ = value;
      expect(resolveRicochet(context, definition, 5, 0).ricocheted).toBe(false);
    }
    for (const normal of [
      { x: 0, y: 0 },
      { x: NaN, y: Infinity },
    ]) {
      const context = contact();
      context.event.surfaceNormal = normal;
      expect(resolveRicochet(context, definition, 5, 0)).toMatchObject({ reason: 'invalidInput' });
    }
    expect(resolveRicochet(contact(), definition, 5, 0.5)).toMatchObject({
      reason: 'invalidInput',
    });
  });
});
