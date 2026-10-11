import assert from 'node:assert/strict';
import console from 'node:console';
import { writeFileSync } from 'node:fs';
import { URL } from 'node:url';
import { Texture } from 'pixi.js';
import { TerrainGrid } from '../../src/game/terrain/TerrainGrid.ts';
import { circleTouchesTerrain, sweepTerrain } from '../../src/game/terrain/terrainCollision.ts';
import { TerrainLayer } from '../../src/game/rendering/TerrainLayer.ts';

const grid = new TerrainGrid(3, 3, 0.2);
grid.setSolid(1, 1, true);
const center = { x: 0.2 - 0.12 / Math.SQRT2 + 0.0001, y: 0.2 - 0.12 / Math.SQRT2 + 0.0001 };
const from = { x: center.x - 0.028, y: center.y + 0.028 };
const to = { x: center.x + 0.028, y: center.y - 0.028 };
const grazing = {
  from,
  to,
  radius: 0.12,
  centerContact: circleTouchesTerrain(grid, center, 0.12),
  sweep: sweepTerrain(grid, from, to, 0.12),
};
assert.equal(grazing.centerContact, true);
assert.equal(grazing.sweep, null);

const outside = new TerrainGrid(3, 3, 1, new Uint8Array(9).fill(1));
const outsideResult = outside.destroyCircle({ x: -100, y: 1.5 }, 0.1);
assert.equal(outsideResult.modifiedPixels, 1);

class FakeWorker {
  requests = [];
  onmessage = null;
  postMessage(request) {
    this.requests.push(request);
  }
  terminate() {}
  complete() {
    const request = this.requests.at(-1);
    this.onmessage({
      data: {
        ...request,
        type: 'terrainFieldBuilt',
        field: new ArrayBuffer(request.fieldWidth * request.fieldHeight * 4),
        fieldBuildMs: 1,
      },
    });
  }
}
const worker = new FakeWorker();
const layer = new TerrainLayer(
  () => worker,
  async () => Texture.WHITE,
);
const terrain = new TerrainGrid(8, 8, 1);
const settings = { enabled: true, quality: 4 };
layer.update(terrain, settings, { orientation: 'mirrored' });
for (let i = 0; i < 20; i++) {
  terrain.setSolid(1, 1, i % 2 === 0);
  layer.update(terrain, settings, { orientation: 'mirrored' });
  worker.complete();
}
const starvation = {
  completedRequests: 20,
  dispatchedRequests: worker.requests.length,
  publishedChunks: layer.getVisualChunks().length,
};
assert.equal(starvation.publishedChunks, 0);
layer.destroy();
const results = {
  grazingAtDefaultRadius: grazing,
  outsideCircle: outsideResult,
  sustainedEdits: starvation,
};
writeFileSync(
  new URL('./reproductions.json', import.meta.url),
  JSON.stringify(results, null, 2) + '\n',
);
console.log(JSON.stringify(results, null, 2));
