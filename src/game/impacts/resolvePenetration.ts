import type { Vec2 } from '../math/Vec2';
import { findTerrainContactCell } from '../terrain/terrainCollision';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import { TerrainMaterialId } from '../terrain/TerrainMaterialId';
import {
  terrainMaterialDefinitions,
  type TerrainMaterialDefinition,
} from '../terrain/TerrainMaterialDefinition';
import type { ProjectilePenetrationDefinition } from './ProjectilePenetrationDefinition';
import type { PenetrationResult } from './PenetrationResult';
import type { ActivePenetrationState, ActivePenetrationStep } from './PenetrationResult';

export const MAX_PENETRATION_SAMPLES = 4096;

/** Prefer the center material; use rim contact for entry, grazing and exit clearance. */
export function impactMaterial(
  terrain: TerrainGrid,
  position: Vec2,
  radius: number,
): TerrainMaterialId {
  const material = terrain.getMaterialAtWorldPosition(position);
  if (material !== TerrainMaterialId.Air) return material;
  const cell = findTerrainContactCell(terrain, position, radius);
  return cell ? terrain.getMaterialAtCell(cell.x, cell.y) : TerrainMaterialId.Air;
}

export interface PenetrationInput {
  entryPosition: Vec2;
  velocity: Vec2;
  initialEnergyJ: number;
  massKg: number;
  radiusMeters: number;
  definition: ProjectilePenetrationDefinition;
  terrain: TerrainGrid;
  materials?: Readonly<Record<TerrainMaterialId, TerrainMaterialDefinition>>;
}

/** Pure, bounded sampling. Terrain damage is applied only after the entire decision. */
export function resolvePenetration(input: PenetrationInput): PenetrationResult {
  const { entryPosition, velocity, massKg, radiusMeters, definition, terrain } = input;
  const materials = input.materials ?? terrainMaterialDefinitions;
  const initialEnergyJ = Number.isFinite(input.initialEnergyJ)
    ? Math.max(0, input.initialEnergyJ)
    : 0;
  const safeEntry =
    Number.isFinite(entryPosition.x) && Number.isFinite(entryPosition.y)
      ? { ...entryPosition }
      : { x: 0, y: 0 };
  const result: PenetrationResult = {
    penetrated: false,
    reason: 'invalidInput',
    entryPosition: safeEntry,
    finalPosition: { ...safeEntry },
    remainingVelocity: { x: 0, y: 0 },
    penetrationDistanceMeters: 0,
    initialEnergyJ,
    remainingEnergyJ: initialEnergyJ,
    traversedSegments: [],
  };
  const speed = Math.hypot(velocity.x, velocity.y);
  if (
    !definition.enabled ||
    ![
      entryPosition.x,
      entryPosition.y,
      speed,
      input.initialEnergyJ,
      massKg,
      radiusMeters,
      definition.penetrationPower,
      definition.maxPenetrationDistanceMeters,
      definition.minimumExitEnergyJ,
      definition.penetrationRadiusMeters,
    ].every(Number.isFinite) ||
    speed <= 0 ||
    massKg <= 0 ||
    radiusMeters < 0 ||
    input.initialEnergyJ < 0 ||
    definition.penetrationPower <= 0 ||
    definition.maxPenetrationDistanceMeters <= 0 ||
    definition.minimumExitEnergyJ < 0 ||
    definition.penetrationRadiusMeters <= 0
  )
    return result;

  if (initialEnergyJ <= definition.minimumExitEnergyJ) {
    result.reason = 'energy';
    return result;
  }
  let materialId = impactMaterial(terrain, entryPosition, radiusMeters);
  if (materialId === TerrainMaterialId.Air) {
    result.reason = 'noContact';
    return result;
  }
  const direction = { x: velocity.x / speed, y: velocity.y / speed };
  const stepSize = terrain.cellSizeMeters * 0.5;
  const epsilon = terrain.cellSizeMeters * 0.001;
  const positionAt = (distance: number): Vec2 => ({
    x: entryPosition.x + direction.x * distance,
    y: entryPosition.y + direction.y * distance,
  });

  for (let sample = 0; sample < MAX_PENETRATION_SAMPLES; sample++) {
    const from = result.finalPosition;
    const distanceLeft = definition.maxPenetrationDistanceMeters - result.penetrationDistanceMeters;
    let distance = Math.min(stepSize, distanceLeft);
    const midpoint = positionAt(result.penetrationDistanceMeters + distance * 0.5);
    const sampledMaterial = impactMaterial(terrain, midpoint, radiusMeters);
    // Charge the trailing partial step as the last material until the whole circle clears it.
    if (sampledMaterial !== TerrainMaterialId.Air) materialId = sampledMaterial;
    const resistance = materials[materialId].penetrationResistance / definition.penetrationPower;
    if (!Number.isFinite(resistance) || resistance < 0) return result;
    const availableEnergy = Math.max(0, result.remainingEnergyJ - definition.minimumExitEnergyJ);
    const energyLimited = resistance > 0 && resistance * distance >= availableEnergy;
    if (energyLimited) distance = Math.min(distance, availableEnergy / resistance);
    const energyLostJ = Math.min(result.remainingEnergyJ, resistance * distance);
    result.penetrationDistanceMeters = Math.min(
      definition.maxPenetrationDistanceMeters,
      result.penetrationDistanceMeters + distance,
    );
    const to = positionAt(result.penetrationDistanceMeters);
    result.remainingEnergyJ = Math.max(0, result.remainingEnergyJ - energyLostJ);
    result.finalPosition = to;
    if (distance > 0)
      result.traversedSegments.push({
        materialId,
        from: { ...from },
        to: { ...to },
        distanceMeters: distance,
        energyLostJ,
      });
    if (energyLimited || result.remainingEnergyJ <= definition.minimumExitEnergyJ) {
      result.reason = 'energy';
      return result;
    }
    if (distanceLeft <= stepSize) {
      result.reason = 'maxDistance';
      return result;
    }

    const nextMaterial = impactMaterial(terrain, to, radiusMeters);
    if (nextMaterial === TerrainMaterialId.Air) {
      // Cell-scaled nudge cannot move the shell into a second obstacle.
      const nudged = positionAt(result.penetrationDistanceMeters + epsilon);
      const exit =
        impactMaterial(terrain, nudged, radiusMeters) === TerrainMaterialId.Air ? nudged : to;
      // Include the tiny clearance offset in debug geometry, not in material energy cost.
      result.finalPosition = { ...exit };
      result.exitPosition = { ...exit };
      result.penetrated = true;
      result.reason = 'exited';
      const exitSpeed = Math.sqrt((2 * result.remainingEnergyJ) / massKg);
      result.remainingVelocity = { x: direction.x * exitSpeed, y: direction.y * exitSpeed };
      return result;
    }
    materialId = nextMaterial;
  }
  result.reason = 'sampleLimit';
  return result;
}

/** Start a persistent traversal at the first contact. No distance is consumed here. */
export function createActivePenetration(input: PenetrationInput): ActivePenetrationState | null {
  const { entryPosition, velocity, massKg, radiusMeters, definition, terrain } = input;
  const speed = Math.hypot(velocity.x, velocity.y);
  const energyJ = Number.isFinite(input.initialEnergyJ) ? Math.max(0, input.initialEnergyJ) : 0;
  const materialId = impactMaterial(terrain, entryPosition, radiusMeters);
  if (
    !definition.enabled ||
    ![
      entryPosition.x,
      entryPosition.y,
      velocity.x,
      velocity.y,
      speed,
      input.initialEnergyJ,
      massKg,
      radiusMeters,
      definition.penetrationPower,
      definition.maxPenetrationDistanceMeters,
      definition.minimumExitEnergyJ,
      definition.penetrationRadiusMeters,
    ].every(Number.isFinite) ||
    speed <= 0 ||
    energyJ <= definition.minimumExitEnergyJ ||
    massKg <= 0 ||
    radiusMeters < 0 ||
    definition.penetrationPower <= 0 ||
    definition.maxPenetrationDistanceMeters <= 0 ||
    definition.minimumExitEnergyJ < 0 ||
    definition.penetrationRadiusMeters <= 0 ||
    materialId === TerrainMaterialId.Air
  )
    return null;
  const sampleStepMeters = terrain.cellSizeMeters * 0.5;
  const materialSamples: TerrainMaterialId[] = [];
  let exitDistanceMeters = definition.maxPenetrationDistanceMeters;
  for (
    let sample = 0;
    sample < MAX_PENETRATION_SAMPLES &&
    sample * sampleStepMeters < definition.maxPenetrationDistanceMeters;
    sample++
  ) {
    const distance = sample * sampleStepMeters + sampleStepMeters * 0.5;
    const samplePosition = {
      x: entryPosition.x + (velocity.x / speed) * distance,
      y: entryPosition.y + (velocity.y / speed) * distance,
    };
    const sampledMaterial = impactMaterial(terrain, samplePosition, radiusMeters);
    materialSamples.push(sampledMaterial);
    if (sampledMaterial === TerrainMaterialId.Air) {
      exitDistanceMeters = sample * sampleStepMeters;
      break;
    }
  }
  return {
    position: { ...entryPosition },
    direction: { x: velocity.x / speed, y: velocity.y / speed },
    materialId,
    energyJ,
    initialEnergyJ: energyJ,
    distanceMeters: 0,
    sampleStepMeters,
    materialSamples,
    exitDistanceMeters,
  };
}

/**
 * Advance an active penetrator for one simulation tick. The returned distance is
 * bounded by `speed * dt`; energy and velocity therefore change over multiple ticks.
 */
export function advanceActivePenetration(
  state: ActivePenetrationState,
  massKg: number,
  radiusMeters: number,
  definition: ProjectilePenetrationDefinition,
  terrain: TerrainGrid,
  dt: number,
  materials: Readonly<
    Record<TerrainMaterialId, TerrainMaterialDefinition>
  > = terrainMaterialDefinitions,
): ActivePenetrationStep {
  const from = { ...state.position };
  const speed = Math.sqrt(Math.max(0, (2 * state.energyJ) / massKg));
  const empty: ActivePenetrationStep = {
    status: 'stopped',
    reason: 'energy',
    from,
    to: from,
    distanceMeters: 0,
    energyLostJ: 0,
    remainingEnergyJ: state.energyJ,
    remainingVelocity: { x: 0, y: 0 },
    penetrationDistanceMeters: state.distanceMeters,
    materialId: state.materialId,
  };
  if (
    !Number.isFinite(dt) ||
    dt <= 0 ||
    !Number.isFinite(speed) ||
    speed <= 0 ||
    !Number.isFinite(massKg) ||
    massKg <= 0 ||
    !Number.isFinite(radiusMeters) ||
    radiusMeters < 0 ||
    state.energyJ <= definition.minimumExitEnergyJ
  )
    return empty;

  const stepSize = state.sampleStepMeters;
  const epsilon = terrain.cellSizeMeters * 0.001;
  let remainingDistance = Math.min(
    speed * dt,
    Math.max(0, definition.maxPenetrationDistanceMeters - state.distanceMeters),
  );
  if (remainingDistance <= 1e-9) {
    return {
      ...empty,
      status: 'stopped',
      reason: 'maxDistance',
    };
  }
  let distanceMoved = 0;
  let energyLost = 0;
  let status: ActivePenetrationStep['status'] = 'continue';
  let reason: ActivePenetrationStep['reason'] = 'inProgress';

  while (remainingDistance > 1e-9) {
    const distance = Math.min(stepSize, remainingDistance);
    const sampleIndex = Math.floor(state.distanceMeters / state.sampleStepMeters);
    const materialId = state.materialSamples[sampleIndex] ?? TerrainMaterialId.Air;
    // An Air midpoint means the projectile reached the far side. The channel is
    // applied after this function returns, so it cannot create a false exit here.
    if (materialId === TerrainMaterialId.Air) {
      const exitDistance = Math.max(
        state.distanceMeters,
        Math.min(state.exitDistanceMeters, state.distanceMeters + remainingDistance),
      );
      const exitTravel = Math.max(0, exitDistance - state.distanceMeters);
      state.position = {
        x: state.position.x + state.direction.x * (exitTravel + epsilon),
        y: state.position.y + state.direction.y * (exitTravel + epsilon),
      };
      state.distanceMeters = exitDistance;
      distanceMoved += exitTravel;
      status = 'exited';
      reason = 'exited';
      break;
    }
    state.materialId = materialId;
    const resistance = materials[materialId].penetrationResistance / definition.penetrationPower;
    const availableEnergy = Math.max(0, state.energyJ - definition.minimumExitEnergyJ);
    const affordableDistance = resistance > 0 ? availableEnergy / resistance : distance;
    const actualDistance = Math.min(distance, affordableDistance);
    const lost = Math.min(state.energyJ, actualDistance * resistance);
    state.position = {
      x: state.position.x + state.direction.x * actualDistance,
      y: state.position.y + state.direction.y * actualDistance,
    };
    state.distanceMeters += actualDistance;
    state.energyJ = Math.max(0, state.energyJ - lost);
    distanceMoved += actualDistance;
    energyLost += lost;
    remainingDistance -= actualDistance;
    if (actualDistance + 1e-9 < distance || state.energyJ <= definition.minimumExitEnergyJ) {
      status = 'stopped';
      reason = 'energy';
      break;
    }
    if (state.distanceMeters >= definition.maxPenetrationDistanceMeters - 1e-9) {
      status = 'stopped';
      reason = 'maxDistance';
      break;
    }
  }

  if (status === 'continue' && remainingDistance <= 1e-9) {
    status = 'continue';
    reason = 'inProgress';
  }
  const remainingSpeed = Math.sqrt(Math.max(0, (2 * state.energyJ) / massKg));
  return {
    status,
    reason,
    from,
    to: { ...state.position },
    distanceMeters: distanceMoved,
    energyLostJ: energyLost,
    remainingEnergyJ: state.energyJ,
    remainingVelocity: {
      x: state.direction.x * remainingSpeed,
      y: state.direction.y * remainingSpeed,
    },
    penetrationDistanceMeters: state.distanceMeters,
    materialId: state.materialId,
  };
}
