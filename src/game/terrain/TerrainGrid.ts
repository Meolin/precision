import { clamp, type Vec2 } from '../math/Vec2';
import { TerrainMaterialId } from './TerrainMaterialId';

/** Material bytes in meters; +x right, +y down. No material physics lives here. */
export class TerrainGrid {
  readonly cells: Uint8Array;
  version = 0;

  constructor(
    readonly columns: number,
    readonly rows: number,
    readonly cellSizeMeters: number,
    cells?: Uint8Array,
  ) {
    if (
      !Number.isInteger(columns) ||
      !Number.isInteger(rows) ||
      columns <= 0 ||
      rows <= 0 ||
      !Number.isFinite(cellSizeMeters) ||
      cellSizeMeters <= 0
    )
      throw new Error('Invalid terrain dimensions.');
    if (cells && cells.length !== columns * rows) throw new Error('Terrain data size mismatch.');
    this.cells = cells ? cells.slice() : new Uint8Array(columns * rows);
  }

  getMaterialAtCell(column: number, row: number): TerrainMaterialId {
    if (
      !Number.isInteger(column) ||
      !Number.isInteger(row) ||
      column < 0 ||
      row < 0 ||
      column >= this.columns ||
      row >= this.rows
    )
      return TerrainMaterialId.Air;
    return this.cells[row * this.columns + column] as TerrainMaterialId;
  }

  getMaterialAtWorldPosition(position: Vec2): TerrainMaterialId {
    const cell = this.worldToCell(position);
    return this.getMaterialAtCell(cell.x, cell.y);
  }

  isSolid(column: number, row: number): boolean {
    return this.getMaterialAtCell(column, row) !== TerrainMaterialId.Air;
  }

  setSolid(column: number, row: number, solid: boolean): void {
    this.setMaterial(column, row, solid ? TerrainMaterialId.Soil : TerrainMaterialId.Air);
  }

  setMaterial(column: number, row: number, material: TerrainMaterialId): void {
    if (
      !Number.isInteger(column) ||
      !Number.isInteger(row) ||
      column < 0 ||
      row < 0 ||
      column >= this.columns ||
      row >= this.rows
    )
      return;
    const index = row * this.columns + column;
    const value = material;
    if (this.cells[index] !== value) {
      this.cells[index] = value;
      this.version++;
    }
  }

  worldToCell(position: Vec2): Vec2 {
    return {
      x: Math.floor(position.x / this.cellSizeMeters),
      y: Math.floor(position.y / this.cellSizeMeters),
    };
  }

  findSurfaceY(x: number): number | null {
    const column = Math.floor(x / this.cellSizeMeters);
    for (let row = 0; row < this.rows; row++)
      if (this.isSolid(column, row)) return row * this.cellSizeMeters;
    return null;
  }

  /** Remove cells whose centers lie in the circle; publish one version per edit. */
  removeCircle(center: Vec2, radius: number): number {
    if (
      !Number.isFinite(center.x) ||
      !Number.isFinite(center.y) ||
      !Number.isFinite(radius) ||
      radius <= 0
    )
      return 0;
    const size = this.cellSizeMeters;
    const left = clamp(Math.floor((center.x - radius) / size), 0, this.columns - 1);
    const right = clamp(Math.floor((center.x + radius) / size), 0, this.columns - 1);
    const top = clamp(Math.floor((center.y - radius) / size), 0, this.rows - 1);
    const bottom = clamp(Math.floor((center.y + radius) / size), 0, this.rows - 1);
    let removed = 0;
    for (let row = top; row <= bottom; row++)
      for (let column = left; column <= right; column++) {
        if (
          ((column + 0.5) * size - center.x) ** 2 + ((row + 0.5) * size - center.y) ** 2 >
          radius ** 2
        )
          continue;
        const index = row * this.columns + column;
        if (this.cells[index] !== TerrainMaterialId.Air) {
          this.cells[index] = TerrainMaterialId.Air;
          removed++;
        }
      }
    if (removed > 0) this.version++;
    return removed;
  }

  /** Rasterize a continuous capsule via cell-center distance to its segment. */
  removeCapsule(from: Vec2, to: Vec2, radius: number): number {
    if (![from.x, from.y, to.x, to.y, radius].every(Number.isFinite) || radius <= 0) return 0;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return this.removeCircle(from, radius);
    const size = this.cellSizeMeters;
    const left = clamp(Math.floor((Math.min(from.x, to.x) - radius) / size), 0, this.columns - 1);
    const right = clamp(Math.floor((Math.max(from.x, to.x) + radius) / size), 0, this.columns - 1);
    const top = clamp(Math.floor((Math.min(from.y, to.y) - radius) / size), 0, this.rows - 1);
    const bottom = clamp(Math.floor((Math.max(from.y, to.y) + radius) / size), 0, this.rows - 1);
    let removed = 0;
    for (let row = top; row <= bottom; row++)
      for (let col = left; col <= right; col++) {
        const px = (col + 0.5) * size - from.x;
        const py = (row + 0.5) * size - from.y;
        const t = clamp((px * dx + py * dy) / lengthSquared, 0, 1);
        if ((px - dx * t) ** 2 + (py - dy * t) ** 2 > radius * radius) continue;
        const index = row * this.columns + col;
        if (this.cells[index] !== TerrainMaterialId.Air) {
          this.cells[index] = TerrainMaterialId.Air;
          removed++;
        }
      }
    if (removed > 0) this.version++;
    return removed;
  }
}
