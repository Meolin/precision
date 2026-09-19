import type { EntityId, Vec2 } from '../math/Vec2';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import type { HealthState } from './HealthState';
import type { Hitbox } from './Hitbox';
import { createMovementState, type UnitMovementState } from '../movement/UnitMovementState';
import { isInstallation } from './InstallationState';
import { cloneOrder } from '../orders/InstallationOrder';

export type TeamId = number;
export type PlayerId = number;

/** Simulation owns units. CannonState extends this with its existing weapon controls. */
export interface UnitState {
  id: EntityId;
  teamId: TeamId;
  ownerPlayerId?: PlayerId;
  kind?: 'installation' | 'drone';
  mobilityType?: 'stationary' | 'air';
  position: Vec2;
  health: HealthState;
  hitbox: Hitbox;
  alive: boolean;
  movement?: UnitMovementState;
}

export function spawnTarget(terrain: TerrainGrid, id: EntityId): UnitState {
  const radiusMeters = 0.8;
  const x = terrain.columns * terrain.cellSizeMeters * 0.72;
  const surfaceY = terrain.findSurfaceY(x);
  if (surfaceY === null) throw new Error('Target spawn requires solid terrain.');
  return {
    id,
    teamId: 2,
    ownerPlayerId: 2,
    position: { x, y: surfaceY - radiusMeters },
    health: { current: 100, max: 100 },
    hitbox: { type: 'circle', radiusMeters },
    alive: true,
    movement: createMovementState(0),
  };
}

export function cloneUnit<T extends UnitState>(unit: T): T {
  return {
    ...unit,
    position: { ...unit.position },
    health: { ...unit.health },
    ...(unit.movement ? { movement: { ...unit.movement } } : {}),
    ...(isInstallation(unit)
      ? {
          availableWeaponIds: [...unit.availableWeaponIds],
          orders: unit.orders.map(cloneOrder),
          grounding: { ...unit.grounding },
          fireControl: {
            ...unit.fireControl,
            lastSolution: unit.fireControl.lastSolution
              ? { ...unit.fireControl.lastSolution }
              : null,
          },
        }
      : {}),
    hitbox: {
      ...unit.hitbox,
      ...(unit.hitbox.offset ? { offset: { ...unit.hitbox.offset } } : {}),
    },
  };
}
