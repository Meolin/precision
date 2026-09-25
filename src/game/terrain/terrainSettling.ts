import type { TerrainRect } from './TerrainChunk';
import { unionTerrainRect } from './TerrainChunk';
import { TerrainGrid, type TerrainMaterialChange } from './TerrainGrid';
import { TerrainMaterialId } from './TerrainMaterialId';

/** A damaged region waits for nearby projectile edits to finish before settling. */
export interface PendingTerrainSettling {
  rect: TerrainRect;
  readyAtSeconds: number;
}

export interface FallingTerrainCell {
  fromColumn: number;
  fromRow: number;
  toColumn: number;
  toRow: number;
  material: TerrainMaterialId;
}

export interface FallingTerrainCluster {
  cells: FallingTerrainCell[];
  elapsedSeconds: number;
  durationSeconds: number;
}

export const terrainSettleDelaySeconds = 0.05;
export const terrainFallDurationSeconds = 0.24;
const maxLooseThicknessCells = 3;
const detectionPaddingCells = maxLooseThicknessCells + 1;
const mergeGapCells = 3;

function regionsNear(a: TerrainRect, b: TerrainRect): boolean {
  return (
    a.minX <= b.maxX + mergeGapCells &&
    b.minX <= a.maxX + mergeGapCells &&
    a.minY <= b.maxY + mergeGapCells &&
    b.minY <= a.maxY + mergeGapCells
  );
}

export function queueTerrainSettling(
  pending: PendingTerrainSettling[],
  rect: TerrainRect,
  nowSeconds: number,
): void {
  let combined = { ...rect };
  for (let index = 0; index < pending.length;) {
    if (!regionsNear(pending[index]!.rect, combined)) {
      index++;
      continue;
    }
    combined = unionTerrainRect(combined, pending[index]!.rect);
    pending.splice(index, 1);
    index = 0;
  }
  pending.push({ rect: combined, readyAtSeconds: nowSeconds + terrainSettleDelaySeconds });
}

function looseCells(terrain: TerrainGrid, rect: TerrainRect): Set<number> {
  const cells = new Set<number>();
  const minX = Math.max(0, rect.minX - detectionPaddingCells);
  const maxX = Math.min(terrain.columns - 1, rect.maxX + detectionPaddingCells);
  const minY = Math.max(0, rect.minY - detectionPaddingCells);
  const maxY = Math.min(terrain.rows - 1, rect.maxY + detectionPaddingCells);
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY;) {
      if (terrain.getMaterialAtCell(x, y) === TerrainMaterialId.Air) {
        y++;
        continue;
      }
      const top = y;
      while (y < terrain.rows && terrain.getMaterialAtCell(x, y) !== TerrainMaterialId.Air) y++;
      const bottom = y - 1;
      if (
        bottom - top + 1 > maxLooseThicknessCells ||
        top === 0 ||
        terrain.getMaterialAtCell(x, top - 1) !== TerrainMaterialId.Air ||
        y >= terrain.rows ||
        bottom < rect.minY - 1 ||
        top > rect.maxY + 1
      )
        continue;
      for (let row = top; row <= bottom; row++) cells.add(row * terrain.columns + x);
    }
  }
  return cells;
}

function looseComponents(terrain: TerrainGrid, rect: TerrainRect): number[][] {
  const remaining = looseCells(terrain, rect);
  const components: number[][] = [];
  while (remaining.size > 0) {
    const first = remaining.values().next().value as number;
    remaining.delete(first);
    const component = [first];
    for (let index = 0; index < component.length; index++) {
      const cell = component[index]!;
      const x = cell % terrain.columns;
      const y = Math.floor(cell / terrain.columns);
      // Small gaps are common in a grazing penetration channel; gather one trail together.
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= terrain.columns || ny < 0 || ny >= terrain.rows) continue;
          const neighbor = ny * terrain.columns + nx;
          if (!remaining.delete(neighbor)) continue;
          component.push(neighbor);
        }
    }
    components.push(component);
  }
  const bottomRow = (component: readonly number[]) =>
    component.reduce((bottom, cell) => Math.max(bottom, Math.floor(cell / terrain.columns)), 0);
  return components.sort((a, b) => bottomRow(b) - bottomRow(a));
}

function planComponent(
  terrain: TerrainGrid,
  cells: readonly number[],
  reserved: Set<number>,
  removedSources: Set<number>,
): FallingTerrainCluster | null {
  const source = cells.map((index) => ({
    column: index % terrain.columns,
    row: Math.floor(index / terrain.columns),
    material: terrain.cells[index] as TerrainMaterialId,
  }));
  const centerX = Math.round(source.reduce((sum, cell) => sum + cell.column, 0) / source.length);
  const bottomByColumn = new Map<number, number>();
  for (const cell of source)
    bottomByColumn.set(cell.column, Math.max(cell.row, bottomByColumn.get(cell.column) ?? -1));
  const radius = Math.min(96, Math.max(3, Math.ceil(Math.sqrt(source.length * 3))));
  const firstX = Math.max(0, centerX - radius);
  const lastX = Math.min(terrain.columns - 1, centerX + radius);
  const columns: { x: number; row: number; sourceBottom: number }[] = [];
  for (let x = firstX; x <= lastX; x++) {
    let nearest = source[0]!.column;
    for (const sourceX of bottomByColumn.keys())
      if (Math.abs(sourceX - x) < Math.abs(nearest - x)) nearest = sourceX;
    const sourceBottom = bottomByColumn.get(nearest)!;
    let floor = sourceBottom + 1;
    while (floor < terrain.rows) {
      const index = floor * terrain.columns + x;
      if (reserved.has(index)) break;
      if (
        terrain.getMaterialAtCell(x, floor) !== TerrainMaterialId.Air &&
        !removedSources.has(index)
      )
        break;
      floor++;
    }
    if (floor >= terrain.rows || floor - 1 <= sourceBottom) continue;
    columns.push({ x, row: floor - 1, sourceBottom });
  }
  if (columns.length === 0) return null;

  const planned: FallingTerrainCell[] = [];
  for (const cell of source) {
    let best: (typeof columns)[number] | undefined;
    let bestScore = -Infinity;
    for (const column of columns) {
      if (column.row < column.sourceBottom) continue;
      const score = column.row - Math.abs(column.x - centerX) * 0.6;
      if (score <= bestScore) continue;
      best = column;
      bestScore = score;
    }
    if (!best) return null;
    planned.push({
      fromColumn: cell.column,
      fromRow: cell.row,
      toColumn: best.x,
      toRow: best.row,
      material: cell.material,
    });
    best.row--;
  }
  for (const cell of planned) reserved.add(cell.toRow * terrain.columns + cell.toColumn);
  return { cells: planned, elapsedSeconds: 0, durationSeconds: terrainFallDurationSeconds };
}

/** Remove unstable cells from collision and hand their animation to the renderer. */
export function startTerrainFall(
  terrain: TerrainGrid,
  rect: TerrainRect,
  active: readonly FallingTerrainCluster[] = [],
): FallingTerrainCluster[] {
  const reserved = new Set<number>();
  for (const cluster of active)
    for (const cell of cluster.cells) reserved.add(cell.toRow * terrain.columns + cell.toColumn);
  const clusters: FallingTerrainCluster[] = [];
  const removedSources = new Set<number>();
  for (const component of looseComponents(terrain, rect)) {
    const planned = planComponent(terrain, component, reserved, removedSources);
    if (!planned) continue;
    clusters.push(planned);
    for (const cell of planned.cells)
      removedSources.add(cell.fromRow * terrain.columns + cell.fromColumn);
  }
  const removed: TerrainMaterialChange[] = clusters.flatMap((cluster) =>
    cluster.cells.map((cell) => ({
      column: cell.fromColumn,
      row: cell.fromRow,
      material: TerrainMaterialId.Air,
    })),
  );
  terrain.applyMaterialChanges(removed);
  return clusters;
}

/** Complete finished falls in one terrain update. The falling cells are simulation state. */
export function advanceTerrainFall(
  terrain: TerrainGrid,
  active: FallingTerrainCluster[],
  dt: number,
): void {
  const deposited: TerrainMaterialChange[] = [];
  const occupied = new Set<number>();
  const solid = (column: number, row: number) =>
    row >= terrain.rows ||
    (row >= 0 &&
      (occupied.has(row * terrain.columns + column) ||
        terrain.getMaterialAtCell(column, row) !== TerrainMaterialId.Air));
  for (let index = 0; index < active.length;) {
    const cluster = active[index]!;
    cluster.elapsedSeconds += dt;
    if (cluster.elapsedSeconds < cluster.durationSeconds) {
      index++;
      continue;
    }
    for (const cell of cluster.cells) {
      let row = cell.toRow;
      if (solid(cell.toColumn, row)) {
        while (row >= 0 && solid(cell.toColumn, row)) row--;
      } else {
        while (row + 1 < terrain.rows && !solid(cell.toColumn, row + 1)) row++;
      }
      if (row < 0 || row >= terrain.rows) continue;
      occupied.add(row * terrain.columns + cell.toColumn);
      deposited.push({ column: cell.toColumn, row, material: cell.material });
    }
    active.splice(index, 1);
  }
  terrain.applyMaterialChanges(deposited);
}
