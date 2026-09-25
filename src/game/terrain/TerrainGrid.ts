import { clamp, type Vec2 } from '../math/Vec2';
import {
  unionTerrainRect,
  type TerrainChangeResult,
  type TerrainChunk,
  type TerrainChunkChange,
  type TerrainChunkId,
  type TerrainRect,
} from './TerrainChunk';
import { TerrainMaterialId } from './TerrainMaterialId';

export const defaultTerrainChunkSizeCells = 256;
const maxChangeHistory = 512;

interface PendingChunkChange {
  chunk: TerrainChunk;
  dirtyRect: TerrainRect;
}

export interface TerrainMaterialChange {
  readonly column: number;
  readonly row: number;
  readonly material: TerrainMaterialId;
}

/**
 * Authoritative terrain storage. Materials remain a compact byte map while all occupancy queries
 * use independently updateable packed chunk masks. Coordinates are cells unless named otherwise.
 */
export class TerrainGrid {
  readonly cells: Uint8Array;
  readonly chunks: readonly TerrainChunk[];
  readonly chunkColumns: number;
  readonly chunkRows: number;
  version = 0;
  lastChange: TerrainChangeResult;
  collisionQueryCount = 0;
  totalModifiedPixels = 0;
  /** Immutable generation profile for subcell rendering; collision always uses cells. */
  readonly initialSurfaceMeters: readonly number[] | undefined;

  private readonly mutableChunks: TerrainChunk[];
  private readonly changeHistory: TerrainChangeResult[] = [];

  constructor(
    readonly columns: number,
    readonly rows: number,
    readonly cellSizeMeters: number,
    cells?: Uint8Array,
    readonly chunkSizeCells = defaultTerrainChunkSizeCells,
    initialSurfaceMeters?: readonly number[],
  ) {
    if (
      !Number.isInteger(columns) ||
      !Number.isInteger(rows) ||
      columns <= 0 ||
      rows <= 0 ||
      !Number.isFinite(cellSizeMeters) ||
      cellSizeMeters <= 0 ||
      !Number.isInteger(chunkSizeCells) ||
      chunkSizeCells <= 0
    )
      throw new Error('Invalid terrain dimensions.');
    if (cells && cells.length !== columns * rows) throw new Error('Terrain data size mismatch.');
    if (
      initialSurfaceMeters &&
      (initialSurfaceMeters.length !== columns ||
        initialSurfaceMeters.some((height) => !Number.isFinite(height)))
    )
      throw new Error('Invalid initial terrain surface.');
    this.initialSurfaceMeters = initialSurfaceMeters
      ? Object.freeze([...initialSurfaceMeters])
      : undefined;
    this.cells = cells ? cells.slice() : new Uint8Array(columns * rows);
    this.chunkColumns = Math.ceil(columns / chunkSizeCells);
    this.chunkRows = Math.ceil(rows / chunkSizeCells);
    this.mutableChunks = [];
    for (let chunkRow = 0; chunkRow < this.chunkRows; chunkRow++)
      for (let chunkColumn = 0; chunkColumn < this.chunkColumns; chunkColumn++) {
        const originX = chunkColumn * chunkSizeCells;
        const originY = chunkRow * chunkSizeCells;
        const width = Math.min(chunkSizeCells, columns - originX);
        const height = Math.min(chunkSizeCells, rows - originY);
        const wordsPerRow = Math.ceil(width / 32);
        const chunk: TerrainChunk = {
          id: { column: chunkColumn, row: chunkRow },
          originX,
          originY,
          width,
          height,
          wordsPerRow,
          collision: new Uint32Array(wordsPerRow * height),
          revision: 0,
          dirty: false,
        };
        this.mutableChunks.push(chunk);
      }
    this.chunks = this.mutableChunks;
    this.rebuildCollisionMask();
    this.lastChange = this.emptyChange();
  }

  getMaterialAtCell(column: number, row: number): TerrainMaterialId {
    if (!this.isInBounds(column, row)) return TerrainMaterialId.Air;
    return this.cells[row * this.columns + column] as TerrainMaterialId;
  }

  getMaterialAtWorldPosition(position: Vec2): TerrainMaterialId {
    const cell = this.worldToCell(position);
    return this.getMaterialAtCell(cell.x, cell.y);
  }

  /** Approximately O(1); storage layout is intentionally hidden from callers. */
  isSolid(column: number, row: number): boolean {
    this.collisionQueryCount++;
    if (!this.isInBounds(column, row)) return false;
    const chunk = this.chunkAtCell(column, row)!;
    const localX = column - chunk.originX;
    const localY = row - chunk.originY;
    const word = chunk.collision[localY * chunk.wordsPerRow + (localX >>> 5)] ?? 0;
    return (word & (1 << (localX & 31))) !== 0;
  }

  setSolid(column: number, row: number, solid: boolean): void {
    this.setMaterial(column, row, solid ? TerrainMaterialId.Soil : TerrainMaterialId.Air);
  }

  setMaterial(column: number, row: number, material: TerrainMaterialId): void {
    if (!this.isInBounds(column, row)) return;
    const index = row * this.columns + column;
    if (this.cells[index] === material) return;
    this.cells[index] = material;
    const chunk = this.chunkAtCell(column, row)!;
    this.writeCollisionBit(chunk, column - chunk.originX, row - chunk.originY, material !== 0);
    const localX = column - chunk.originX;
    const localY = row - chunk.originY;
    this.publishChange(
      new Map([
        [
          this.chunkIndex(chunk.id.column, chunk.id.row),
          {
            chunk,
            dirtyRect: { minX: localX, minY: localY, maxX: localX, maxY: localY },
          },
        ],
      ]),
      { minX: column, minY: row, maxX: column, maxY: row },
      1,
    );
  }

  /** Publish a terrain operation as one version and one dirty region. */
  applyMaterialChanges(changes: readonly TerrainMaterialChange[]): TerrainChangeResult {
    const finalMaterials = new Map<number, TerrainMaterialId>();
    for (const { column, row, material } of changes)
      if (this.isInBounds(column, row)) finalMaterials.set(row * this.columns + column, material);
    const pending = new Map<number, PendingChunkChange>();
    let dirtyRect: TerrainRect | undefined;
    let modified = 0;
    for (const [index, material] of finalMaterials) {
      if (this.cells[index] === material) continue;
      const column = index % this.columns;
      const row = Math.floor(index / this.columns);
      this.cells[index] = material;
      const chunk = this.chunkAtCell(column, row)!;
      const localX = column - chunk.originX;
      const localY = row - chunk.originY;
      this.writeCollisionBit(chunk, localX, localY, material !== TerrainMaterialId.Air);
      this.addPendingChange(pending, chunk, {
        minX: localX,
        minY: localY,
        maxX: localX,
        maxY: localY,
      });
      dirtyRect = unionTerrainRect(dirtyRect, {
        minX: column,
        minY: row,
        maxX: column,
        maxY: row,
      });
      modified++;
    }
    return this.publishChange(pending, dirtyRect, modified);
  }

  worldToCell(position: Vec2): Vec2 {
    return {
      x: Math.floor(position.x / this.cellSizeMeters),
      y: Math.floor(position.y / this.cellSizeMeters),
    };
  }

  findSurfaceY(x: number): number | null {
    const column = Math.floor(x / this.cellSizeMeters);
    if (column < 0 || column >= this.columns) return null;
    const chunkColumn = Math.floor(column / this.chunkSizeCells);
    for (let chunkRow = 0; chunkRow < this.chunkRows; chunkRow++) {
      const chunk = this.mutableChunks[this.chunkIndex(chunkColumn, chunkRow)]!;
      const localX = column - chunk.originX;
      const wordIndex = localX >>> 5;
      const mask = 1 << (localX & 31);
      for (let localY = 0; localY < chunk.height; localY++) {
        this.collisionQueryCount++;
        if (((chunk.collision[localY * chunk.wordsPerRow + wordIndex] ?? 0) & mask) !== 0)
          return (chunk.originY + localY) * this.cellSizeMeters;
      }
    }
    return null;
  }

  getChunk(id: TerrainChunkId): TerrainChunk | undefined {
    if (id.column < 0 || id.row < 0 || id.column >= this.chunkColumns || id.row >= this.chunkRows)
      return undefined;
    return this.mutableChunks[this.chunkIndex(id.column, id.row)];
  }

  /** Read-only journal lookup; renderers never acknowledge or mutate simulation dirtiness. */
  getChangesSince(version: number): readonly TerrainChangeResult[] {
    if (version >= this.version) return [];
    const first = this.changeHistory[0];
    if (!first || version < first.version - 1) return [this.fullChange()];
    return this.changeHistory.filter((change) => change.version > version);
  }

  destroyCircle(center: Vec2, radius: number): TerrainChangeResult {
    if (
      !Number.isFinite(center.x) ||
      !Number.isFinite(center.y) ||
      !Number.isFinite(radius) ||
      radius <= 0
    )
      return this.emptyChange();
    const size = this.cellSizeMeters;
    const left = clamp(Math.floor((center.x - radius) / size), 0, this.columns - 1);
    const right = clamp(Math.floor((center.x + radius) / size), 0, this.columns - 1);
    const top = clamp(Math.floor((center.y - radius) / size), 0, this.rows - 1);
    const bottom = clamp(Math.floor((center.y + radius) / size), 0, this.rows - 1);
    const radiusSquared = radius * radius;
    const pending = new Map<number, PendingChunkChange>();
    let dirtyRect: TerrainRect | undefined;
    let removed = 0;
    for (let row = top; row <= bottom; row++) {
      const dy = (row + 0.5) * size - center.y;
      const halfSpanSquared = radiusSquared - dy * dy;
      if (halfSpanSquared < 0) continue;
      const halfSpan = Math.sqrt(halfSpanSquared);
      const spanLeft = clamp(Math.ceil((center.x - halfSpan) / size - 0.5), left, right);
      const spanRight = clamp(Math.floor((center.x + halfSpan) / size - 0.5), left, right);
      if (spanLeft > spanRight) continue;
      const change = this.clearHorizontalSpan(row, spanLeft, spanRight, pending);
      if (!change) continue;
      removed += change.count;
      dirtyRect = unionTerrainRect(dirtyRect, {
        minX: change.minX,
        minY: row,
        maxX: change.maxX,
        maxY: row,
      });
    }
    return this.publishChange(pending, dirtyRect, removed);
  }

  /** Compatibility return value for existing impact telemetry. */
  removeCircle(center: Vec2, radius: number): number {
    return this.destroyCircle(center, radius).modifiedPixels;
  }

  destroyCapsule(from: Vec2, to: Vec2, radius: number): TerrainChangeResult {
    if (![from.x, from.y, to.x, to.y, radius].every(Number.isFinite) || radius <= 0)
      return this.emptyChange();
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return this.destroyCircle(from, radius);
    const size = this.cellSizeMeters;
    const left = clamp(Math.floor((Math.min(from.x, to.x) - radius) / size), 0, this.columns - 1);
    const right = clamp(Math.floor((Math.max(from.x, to.x) + radius) / size), 0, this.columns - 1);
    const top = clamp(Math.floor((Math.min(from.y, to.y) - radius) / size), 0, this.rows - 1);
    const bottom = clamp(Math.floor((Math.max(from.y, to.y) + radius) / size), 0, this.rows - 1);
    const pending = new Map<number, PendingChunkChange>();
    let dirtyRect: TerrainRect | undefined;
    let removed = 0;
    for (let row = top; row <= bottom; row++)
      for (let column = left; column <= right; column++) {
        const px = (column + 0.5) * size - from.x;
        const py = (row + 0.5) * size - from.y;
        const t = clamp((px * dx + py * dy) / lengthSquared, 0, 1);
        if ((px - dx * t) ** 2 + (py - dy * t) ** 2 > radius * radius) continue;
        const index = row * this.columns + column;
        if (this.cells[index] === TerrainMaterialId.Air) continue;
        this.cells[index] = TerrainMaterialId.Air;
        const chunk = this.chunkAtCell(column, row)!;
        const localX = column - chunk.originX;
        const localY = row - chunk.originY;
        this.writeCollisionBit(chunk, localX, localY, false);
        this.addPendingChange(pending, chunk, {
          minX: localX,
          minY: localY,
          maxX: localX,
          maxY: localY,
        });
        dirtyRect = unionTerrainRect(dirtyRect, {
          minX: column,
          minY: row,
          maxX: column,
          maxY: row,
        });
        removed++;
      }
    return this.publishChange(pending, dirtyRect, removed);
  }

  removeCapsule(from: Vec2, to: Vec2, radius: number): number {
    return this.destroyCapsule(from, to, radius).modifiedPixels;
  }

  resetInstrumentation(): void {
    this.collisionQueryCount = 0;
  }

  private rebuildCollisionMask(): void {
    for (const chunk of this.mutableChunks)
      for (let localY = 0; localY < chunk.height; localY++)
        for (let wordIndex = 0; wordIndex < chunk.wordsPerRow; wordIndex++) {
          let word = 0;
          const firstX = wordIndex * 32;
          const lastX = Math.min(chunk.width, firstX + 32);
          for (let localX = firstX; localX < lastX; localX++)
            if (
              this.cells[(chunk.originY + localY) * this.columns + chunk.originX + localX] !==
              TerrainMaterialId.Air
            )
              word |= 1 << (localX & 31);
          chunk.collision[localY * chunk.wordsPerRow + wordIndex] = word;
        }
  }

  private isInBounds(column: number, row: number): boolean {
    return (
      Number.isInteger(column) &&
      Number.isInteger(row) &&
      column >= 0 &&
      row >= 0 &&
      column < this.columns &&
      row < this.rows
    );
  }

  private chunkIndex(column: number, row: number): number {
    return row * this.chunkColumns + column;
  }

  private chunkAtCell(column: number, row: number): TerrainChunk | undefined {
    return this.mutableChunks[
      this.chunkIndex(
        Math.floor(column / this.chunkSizeCells),
        Math.floor(row / this.chunkSizeCells),
      )
    ];
  }

  private writeCollisionBit(
    chunk: TerrainChunk,
    localX: number,
    localY: number,
    solid: boolean,
  ): void {
    const index = localY * chunk.wordsPerRow + (localX >>> 5);
    const mask = 1 << (localX & 31);
    const word = chunk.collision[index] ?? 0;
    chunk.collision[index] = solid ? word | mask : word & ~mask;
  }

  private clearHorizontalSpan(
    row: number,
    left: number,
    right: number,
    pending: Map<number, PendingChunkChange>,
  ): { count: number; minX: number; maxX: number } | null {
    let count = 0;
    let changedMin = Infinity;
    let changedMax = -Infinity;
    let column = left;
    while (column <= right) {
      const chunk = this.chunkAtCell(column, row)!;
      const partRight = Math.min(right, chunk.originX + chunk.width - 1);
      let partCount = 0;
      let partMin = Infinity;
      let partMax = -Infinity;
      for (let x = column; x <= partRight; x++) {
        if (this.cells[row * this.columns + x] === TerrainMaterialId.Air) continue;
        partCount++;
        partMin = Math.min(partMin, x);
        partMax = Math.max(partMax, x);
      }
      if (partCount > 0) {
        this.cells.fill(
          TerrainMaterialId.Air,
          row * this.columns + column,
          row * this.columns + partRight + 1,
        );
        const localY = row - chunk.originY;
        this.clearCollisionSpan(chunk, localY, column - chunk.originX, partRight - chunk.originX);
        this.addPendingChange(pending, chunk, {
          minX: column - chunk.originX,
          minY: localY,
          maxX: partRight - chunk.originX,
          maxY: localY,
        });
        count += partCount;
        changedMin = Math.min(changedMin, partMin);
        changedMax = Math.max(changedMax, partMax);
      }
      column = partRight + 1;
    }
    return count > 0 ? { count, minX: changedMin, maxX: changedMax } : null;
  }

  private clearCollisionSpan(
    chunk: TerrainChunk,
    localY: number,
    localLeft: number,
    localRight: number,
  ): void {
    const firstWord = localLeft >>> 5;
    const lastWord = localRight >>> 5;
    const rowOffset = localY * chunk.wordsPerRow;
    for (let wordIndex = firstWord; wordIndex <= lastWord; wordIndex++) {
      const startBit = wordIndex === firstWord ? localLeft & 31 : 0;
      const endBit = wordIndex === lastWord ? localRight & 31 : 31;
      const leftMask = 0xffffffff << startBit;
      const rightMask = 0xffffffff >>> (31 - endBit);
      const mask = leftMask & rightMask;
      const index = rowOffset + wordIndex;
      chunk.collision[index] = (chunk.collision[index] ?? 0) & ~mask;
    }
  }

  private addPendingChange(
    pending: Map<number, PendingChunkChange>,
    chunk: TerrainChunk,
    dirtyRect: TerrainRect,
  ): void {
    const index = this.chunkIndex(chunk.id.column, chunk.id.row);
    const existing = pending.get(index);
    if (existing) existing.dirtyRect = unionTerrainRect(existing.dirtyRect, dirtyRect);
    else pending.set(index, { chunk, dirtyRect: { ...dirtyRect } });
  }

  private publishChange(
    pending: Map<number, PendingChunkChange>,
    dirtyRect: TerrainRect | undefined,
    modifiedPixels: number,
  ): TerrainChangeResult {
    if (modifiedPixels <= 0 || !dirtyRect) return this.emptyChange();
    this.version++;
    this.totalModifiedPixels += modifiedPixels;
    const affectedChunks: TerrainChunkChange[] = [];
    for (const { chunk, dirtyRect: localRect } of pending.values()) {
      chunk.revision = this.version;
      chunk.dirty = true;
      chunk.dirtyRect = unionTerrainRect(chunk.dirtyRect, localRect);
      affectedChunks.push({ id: { ...chunk.id }, dirtyRect: { ...localRect } });
    }
    affectedChunks.sort((a, b) => a.id.row - b.id.row || a.id.column - b.id.column);
    const result: TerrainChangeResult = {
      changed: true,
      dirtyRect: { ...dirtyRect },
      affectedChunks,
      modifiedPixels,
      version: this.version,
    };
    this.lastChange = result;
    this.changeHistory.push(result);
    if (this.changeHistory.length > maxChangeHistory) this.changeHistory.shift();
    return result;
  }

  private emptyChange(): TerrainChangeResult {
    return { changed: false, affectedChunks: [], modifiedPixels: 0, version: this.version };
  }

  private fullChange(): TerrainChangeResult {
    return {
      changed: true,
      dirtyRect: { minX: 0, minY: 0, maxX: this.columns - 1, maxY: this.rows - 1 },
      affectedChunks: this.mutableChunks.map((chunk) => ({
        id: { ...chunk.id },
        dirtyRect: { minX: 0, minY: 0, maxX: chunk.width - 1, maxY: chunk.height - 1 },
      })),
      modifiedPixels: this.columns * this.rows,
      version: this.version,
    };
  }
}
