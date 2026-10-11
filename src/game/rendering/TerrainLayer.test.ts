import { GlProgram, Texture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { TerrainGrid } from '../terrain/TerrainGrid';
import { TerrainMaterialId } from '../terrain/TerrainMaterialId';
import { TerrainLayer } from './TerrainLayer';
import type { TerrainRasterRequest, TerrainRasterResult } from './terrainRasterProtocol';
import { defaultTerrainTextureSettings } from './TerrainTextureSettings';
import { terrainFieldHaloCells, terrainFieldSamplePaddingCells } from './terrainVisualField';

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

  complete(request: TerrainRasterRequest): void {
    const result: TerrainRasterResult = {
      type: 'terrainFieldBuilt',
      requestId: request.requestId,
      generation: request.generation,
      terrainVersion: request.terrainVersion,
      chunkColumn: request.chunkColumn,
      chunkRow: request.chunkRow,
      chunkWidth: request.chunkWidth,
      chunkHeight: request.chunkHeight,
      fieldWidth: request.fieldWidth,
      fieldHeight: request.fieldHeight,
      field: new Uint8Array(request.fieldWidth * request.fieldHeight * 4).buffer,
      fieldBuildMs: 1,
      queuedAtMs: request.queuedAtMs,
      retry: request.retry,
    };
    this.onmessage?.({ data: result } as MessageEvent<TerrainRasterResult>);
  }
}

const settings = { enabled: true, quality: 4 } as const;
const textureSettings = { ...defaultTerrainTextureSettings };
const noTextureLoad = async () => Texture.WHITE;

describe('TerrainLayer async field queue', () => {
  it('rebuilds the complete chunk when edits arrive during an in-flight request', () => {
    const worker = new FakeWorker();
    const layer = new TerrainLayer(() => worker as unknown as Worker, noTextureLoad);
    const terrain = new TerrainGrid(8, 8, 1);
    layer.update(terrain, settings, textureSettings);
    expect(worker.requests).toHaveLength(1);
    expect(worker.requests[0]).toMatchObject({
      type: 'buildTerrainField',
      chunkWidth: 8,
      chunkHeight: 8,
      fieldWidth: 8 + terrainFieldHaloCells * 2,
      fieldHeight: 8 + terrainFieldHaloCells * 2,
    });

    terrain.setMaterial(1, 1, TerrainMaterialId.Soil);
    terrain.setMaterial(6, 6, TerrainMaterialId.Rock);
    layer.update(terrain, settings, textureSettings);
    expect(worker.requests).toHaveLength(1);

    worker.complete(worker.requests[0]!);
    expect(worker.requests).toHaveLength(2);
    const current = worker.requests[1]!;
    expect(current.terrainVersion).toBe(terrain.version);
    const materials = new Uint8Array(current.materials);
    const padding = terrainFieldHaloCells + terrainFieldSamplePaddingCells;
    expect(materials[(1 + padding) * current.sampleWidth + 1 + padding]).toBe(
      TerrainMaterialId.Soil,
    );
    expect(materials[(6 + padding) * current.sampleWidth + 6 + padding]).toBe(
      TerrainMaterialId.Rock,
    );

    layer.destroy();
    expect(worker.terminated).toBe(true);
  });

  it('discards results from a replaced terrain generation and schedules the replacement', () => {
    const worker = new FakeWorker();
    const layer = new TerrainLayer(() => worker as unknown as Worker, noTextureLoad);
    layer.update(new TerrainGrid(2, 2, 1), settings, textureSettings);
    const obsolete = worker.requests[0]!;
    layer.update(new TerrainGrid(2, 2, 1), settings, textureSettings);

    worker.complete(obsolete);
    expect(worker.requests).toHaveLength(2);
    expect(worker.requests[1]?.generation).toBeGreaterThan(obsolete.generation);

    layer.destroy();
  });

  it('changes visual settings without restarting field reconstruction', () => {
    const program = vi.spyOn(GlProgram, 'from').mockReturnValue({} as GlProgram);
    const worker = new FakeWorker();
    const layer = new TerrainLayer(() => worker as unknown as Worker, noTextureLoad);
    const terrain = new TerrainGrid(2, 2, 1);
    layer.update(terrain, settings, textureSettings);
    worker.complete(worker.requests[0]!);
    const mesh = layer.getVisualChunks()[0]?.mesh;
    expect(mesh).toBeDefined();
    layer.update(
      terrain,
      { enabled: false, quality: 1 },
      { rockTextureId: 'Stone_example2', orientation: 'random' },
    );
    expect(worker.requests).toHaveLength(1);
    expect(layer.getVisualChunks()[0]?.mesh).toBe(mesh);
    layer.destroy();
    program.mockRestore();
  });

  it('releases decoded combined textures after replacement and destruction', async () => {
    const layer = new TerrainLayer(() => new FakeWorker() as unknown as Worker, noTextureLoad);
    const generated = () =>
      ({
        source: { update: vi.fn() },
        destroy: vi.fn(),
      }) as unknown as Texture;
    const first = generated();
    const second = generated();
    const decode = vi
      .spyOn(
        layer as unknown as { loadCombinedAlbedoTexture: (url: string) => Promise<Texture> },
        'loadCombinedAlbedoTexture',
      )
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const maps = vi
      .spyOn(layer['materialMapCache'], 'get')
      .mockResolvedValue({ height: Texture.WHITE, normal: Texture.WHITE });
    const terrain = new TerrainGrid(2, 2, 1);
    layer.update(terrain, settings, { rockTextureId: 'stone_1_mixed', orientation: 'mirrored' });
    await vi.waitFor(() => expect(layer['rockTexture']).toBe(first));
    layer.update(terrain, settings, { rockTextureId: 'stone_2_mixed', orientation: 'mirrored' });
    await vi.waitFor(() => expect(first.destroy).toHaveBeenCalledWith(true));
    const stale = generated();
    let finishStale: (texture: Texture) => void = () => undefined;
    decode.mockImplementationOnce(
      () =>
        new Promise<Texture>((resolve) => {
          finishStale = resolve;
        }),
    );
    layer.update(terrain, settings, { rockTextureId: 'stone_3_mixed', orientation: 'mirrored' });
    layer.update(terrain, settings, { rockTextureId: 'Stone_example', orientation: 'mirrored' });
    finishStale(stale);
    await vi.waitFor(() => expect(stale.destroy).toHaveBeenCalledWith(true));
    layer.destroy();
    expect(second.destroy).toHaveBeenCalledWith(true);
    decode.mockRestore();
    maps.mockRestore();
  });
});
