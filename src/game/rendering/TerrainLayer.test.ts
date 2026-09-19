import { describe, expect, it } from 'vitest';
import { TerrainGrid } from '../terrain/TerrainGrid';
import { TerrainMaterialId } from '../terrain/TerrainMaterialId';
import { TerrainLayer } from './TerrainLayer';
import type { TerrainRasterRequest, TerrainRasterResult } from './terrainRasterProtocol';

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  requests: TerrainRasterRequest[] = [];
  terminated = false;

  postMessage(message: TerrainRasterRequest): void {
    this.requests.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  complete(request: TerrainRasterRequest, bitmap: ImageBitmap): void {
    const result: TerrainRasterResult = {
      type: 'chunkRasterized',
      requestId: request.requestId,
      generation: request.generation,
      terrainVersion: request.terrainVersion,
      settingsRevision: request.settingsRevision,
      chunkColumn: request.chunkColumn,
      chunkRow: request.chunkRow,
      localX: request.localX,
      localY: request.localY,
      width: request.width,
      height: request.height,
      bitmap,
      scale: request.settings.enabled ? request.settings.quality : 1,
      visualUpdateMs: 1,
    };
    this.onmessage?.({ data: result } as MessageEvent<TerrainRasterResult>);
  }
}

function bitmap() {
  let closed = false;
  return {
    value: { close: () => (closed = true) } as unknown as ImageBitmap,
    isClosed: () => closed,
  };
}

const settings = { enabled: true, quality: 4 } as const;

describe('TerrainLayer async raster queue', () => {
  it('coalesces edits made while one request is in flight', () => {
    const worker = new FakeWorker();
    const layer = new TerrainLayer(() => worker as unknown as Worker);
    const terrain = new TerrainGrid(3, 2, 1);
    layer.update(terrain, settings);
    expect(worker.requests).toHaveLength(1);

    terrain.setMaterial(1, 1, TerrainMaterialId.Soil);
    layer.update(terrain, settings);
    expect(worker.requests).toHaveLength(1);

    const firstBitmap = bitmap();
    worker.complete(worker.requests[0]!, firstBitmap.value);
    expect(worker.requests).toHaveLength(2);
    expect(worker.requests[1]?.terrainVersion).toBe(terrain.version);

    layer.destroy();
    expect(firstBitmap.isClosed()).toBe(true);
    expect(worker.terminated).toBe(true);
  });

  it('discards results from a replaced terrain generation', () => {
    const worker = new FakeWorker();
    const layer = new TerrainLayer(() => worker as unknown as Worker);
    layer.update(new TerrainGrid(2, 2, 1), settings);
    const obsolete = worker.requests[0]!;
    layer.update(new TerrainGrid(2, 2, 1), settings);

    const obsoleteBitmap = bitmap();
    worker.complete(obsolete, obsoleteBitmap.value);
    expect(obsoleteBitmap.isClosed()).toBe(true);
    expect(worker.requests).toHaveLength(2);
    expect(worker.requests[1]?.generation).toBeGreaterThan(obsolete.generation);

    layer.destroy();
  });
});
