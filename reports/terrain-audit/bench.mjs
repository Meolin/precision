// Run from repository root: node --loader ./reports/terrain-audit/loader.mjs ./reports/terrain-audit/bench.mjs
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import { cpus } from 'node:os';
import { writeFileSync } from 'node:fs';
import { TerrainGrid } from '../../src/game/terrain/TerrainGrid.ts';
import { sweepTerrain, raycastTerrain } from '../../src/game/terrain/terrainCollision.ts';
import { isBlastPathOccluded } from '../../src/game/explosions/isBlastPathOccluded.ts';
import { buildTerrainVisualField } from '../../src/game/rendering/terrainVisualField.ts';
import { generateTerrain, createSeededRandom } from '../../src/game/terrain/generateTerrain.ts';
import { defaultGameConfig } from '../../src/game/config/defaultGameConfig.ts';
import { GameRuntime } from '../../src/game/core/GameRuntime.ts';
import { queryUnitGrounding } from '../../src/game/movement/terrainGrounding.ts';
import { solveBallisticAim } from '../../src/game/ballistics/solveBallisticAim.ts';

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: values.length,
    meanMs: values.reduce((a, b) => a + b, 0) / values.length,
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    maxMs: sorted.at(-1),
  };
}
function measure(fn, count = 100, batch = 1) {
  for (let i = 0; i < 20; i++) fn();
  const times = [];
  for (let i = 0; i < count; i++) {
    const start = performance.now();
    for (let j = 0; j < batch; j++) fn();
    times.push((performance.now() - start) / batch);
  }
  return stats(times);
}
function materialSample(grid, chunk) {
  const width = chunk.width + 10;
  const height = chunk.height + 10;
  const materials = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      materials[y * width + x] = grid.getMaterialAtCell(
        chunk.originX + x - 5,
        chunk.originY + y - 5,
      );
  return {
    materials,
    sampleWidth: width,
    sampleHeight: height,
    outputWidth: chunk.width + 2,
    outputHeight: chunk.height + 2,
    samplePadding: 4,
  };
}

const output = {
  node: process.version,
  cpu: cpus()[0]?.model,
  date: new Date().toISOString(),
  stages: [],
  scale: [],
};
// Warm-up the mutation path on independent maps; timings never include construction.
for (let j = 0; j < 5; j++) {
  const g = new TerrainGrid(600, 320, 0.2, new Uint8Array(600 * 320).fill(1));
  for (let i = 0; i < 200; i++)
    g.destroyCircle({ x: (i % 40) * 2 + 2, y: Math.floor(i / 40) * 3 + 2 }, 1);
}
const grid = generateTerrain(defaultGameConfig, 42);
const random = createSeededRandom(912);
let historical = 0;
for (const target of [0, 10, 100, 500, 1000]) {
  while (historical < target) {
    grid.destroyCircle({ x: 5 + random() * 350, y: 43 + random() * 18 }, 1.6);
    historical++;
  }
  const mutation = [];
  const probeGrid = new TerrainGrid(grid.columns, grid.rows, grid.cellSizeMeters, grid.cells);
  let probeRemoved = 0;
  // Controlled local mutation: each trial restores only this 17x17 fixture using the public API.
  // Restoration is outside timed interval; it also warms/saturates the bounded journal.
  const probe = { x: 330, y: 57 };
  for (let trial = 0; trial < 100; trial++) {
    for (let y = 277; y <= 293; y++)
      for (let x = 1642; x <= 1658; x++) probeGrid.setSolid(x, y, true);
    const start = performance.now();
    probeRemoved = probeGrid.destroyCircle(probe, 1.6).modifiedPixels;
    mutation.push(performance.now() - start);
  }
  const chunk = grid.getChunk({ column: 3, row: 1 });
  const input = materialSample(grid, chunk);
  grid.resetInstrumentation();
  sweepTerrain(grid, { x: 1, y: 10 }, { x: 101, y: 10 }, 0.1);
  const accesses = grid.collisionQueryCount;
  output.stages.push({
    historicalExplosions: historical,
    probeRemoved,
    mutation: stats(mutation),
    fieldChunk: { width: chunk.width, height: chunk.height },
    fieldBuild: measure(() => buildTerrainVisualField(input), 100),
    emptySweep100m: measure(
      () => sweepTerrain(grid, { x: 1, y: 10 }, { x: 101, y: 10 }, 0.1),
      100,
      10,
    ),
    emptySweepOccupancyReads: accesses,
    surface: measure(() => grid.findSurfaceY(180), 100, 100),
    typedStorageBytes:
      grid.cells.byteLength + grid.chunks.reduce((sum, c) => sum + c.collision.byteLength, 0),
    chunkCount: grid.chunks.length,
  });
}
for (const [columns, rows] of [
  [1800, 320],
  [2400, 1280],
  [3600, 1080],
]) {
  const g = new TerrainGrid(columns, rows, 0.2, new Uint8Array(columns * rows).fill(1));
  const empty = new TerrainGrid(columns, rows, 0.2);
  output.scale.push({
    columns,
    rows,
    clone: measure(() => new TerrainGrid(columns, rows, 0.2, g.cells), 30),
    noSurface: measure(() => empty.findSurfaceY(20), 100, 100),
  });
}
const fullField = {
  materials: new Uint8Array(266 * 266).fill(1),
  sampleWidth: 266,
  sampleHeight: 266,
  outputWidth: 258,
  outputHeight: 258,
  samplePadding: 4,
};
output.fullChunkField = measure(() => buildTerrainVisualField(fullField), 100);
const runtime = new GameRuntime();
const state = runtime.getState();
output.groundEightUnits = measure(() => {
  for (const unit of state.units) queryUnitGrounding(state.terrain, unit, unit.position.x);
}, 100);
const target = { x: 200, y: state.terrain.findSurfaceY(200) };
output.solverOneOrder = measure(
  () => solveBallisticAim(state.cannon, target, state.terrain, runtime.getConfig(), state.units),
  30,
);
const corner = new TerrainGrid(3, 3, 1);
corner.setSolid(1, 1, true);
output.cornerMiss = {
  from: { x: 0.9, y: 1.11 },
  to: { x: 1.11, y: 0.9 },
  analyticCellEntry: { x: 1, y: 1.01 },
  analyticCellExit: { x: 1.01, y: 1 },
  raycast: raycastTerrain(corner, { x: 0.9, y: 1.11 }, { x: 1.11, y: 0.9 }),
  circleSweep: sweepTerrain(corner, { x: 0.9, y: 1.11 }, { x: 1.11, y: 0.9 }, 0.01),
  occluded: isBlastPathOccluded({ x: 0.9, y: 1.11 }, { x: 1.11, y: 0.9 }, corner),
};
writeFileSync(
  new URL('./measurements.json', import.meta.url),
  JSON.stringify(output, null, 2) + '\n',
);
console.log(JSON.stringify(output, null, 2));
