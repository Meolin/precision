import { isControllable } from '../entities/InstallationState';
import { hitboxCenter } from '../entities/Hitbox';
import type { PlayerId, UnitState } from '../entities/UnitState';
import type { EntityId, Vec2 } from '../math/Vec2';

export interface SelectionState {
  selectedEntityIds: EntityId[];
  hoveredEntityId?: EntityId;
}
export type ControlGroups = Partial<Record<number, EntityId[]>>;
export interface SelectionRectangle { start: Vec2; current: Vec2 }

export function filterControllableIds(ids: readonly EntityId[], units: readonly UnitState[], playerId: PlayerId): EntityId[] {
  return [...new Set(ids)].filter((id) => units.some((unit) => unit.id === id && isControllable(unit, playerId))).sort((a, b) => a - b);
}

export function clickSelection(selection: SelectionState, unit: UnitState | undefined, playerId: PlayerId, additive: boolean): EntityId[] {
  if (!unit || !isControllable(unit, playerId)) return additive ? [...selection.selectedEntityIds] : [];
  if (!additive) return [unit.id];
  return selection.selectedEntityIds.includes(unit.id)
    ? selection.selectedEntityIds.filter((id) => id !== unit.id)
    : [...selection.selectedEntityIds, unit.id].sort((a, b) => a - b);
}

/** Center-point selection in CSS screen pixels, independent of device pixel ratio. */
export function boxSelection(rect: SelectionRectangle, units: readonly UnitState[], playerId: PlayerId, project: (point: Vec2) => Vec2): EntityId[] {
  const minX = Math.min(rect.start.x, rect.current.x);
  const maxX = Math.max(rect.start.x, rect.current.x);
  const minY = Math.min(rect.start.y, rect.current.y);
  const maxY = Math.max(rect.start.y, rect.current.y);
  return units.filter((unit) => {
    if (!isControllable(unit, playerId)) return false;
    const point = project(hitboxCenter(unit.position, unit.hitbox));
    return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
  }).map((unit) => unit.id).sort((a, b) => a - b);
}
