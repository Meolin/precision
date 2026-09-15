import type { EntityId } from '../math/Vec2';

export interface MoveUnitCommand {
  type: 'moveUnit';
  unitId: EntityId;
  targetX: number;
}
