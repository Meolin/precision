import { describe, expect, it, vi } from 'vitest';
import { createDefaultAppSettings, normalizeAppSettings, saveAppSettings } from './AppSettings';

describe('app settings persistence', () => {
  it('restores every right-panel settings owner', () => {
    const saved = createDefaultAppSettings();
    saved.gameConfig.physics.gravity = 4.2;
    saved.gameConfig.weaponOverrides.mortar = { explosion: { enabled: false } };
    saved.debug.grid = true;
    saved.shaders.enabled = false;
    saved.shaders.effects.color.values.brightness = 1.4;
    saved.terrainSmoothing = { enabled: false, quality: 16 };
    saved.terrainTexture.orientation = 'sequential';
    saved.cameraZoom = 2.25;

    const restored = normalizeAppSettings(JSON.parse(JSON.stringify(saved)));

    expect(restored.gameConfig.physics.gravity).toBe(4.2);
    expect(restored.gameConfig.weaponOverrides.mortar?.explosion?.enabled).toBe(false);
    expect(restored.debug.grid).toBe(true);
    expect(restored.shaders.enabled).toBe(false);
    expect(restored.shaders.effects.color.values.brightness).toBe(1.4);
    expect(restored.terrainSmoothing).toEqual({ enabled: false, quality: 16 });
    expect(restored.terrainTexture.orientation).toBe('sequential');
    expect(restored.cameraZoom).toBe(2.25);
  });

  it('merges incomplete or invalid JSON with safe defaults', () => {
    const restored = normalizeAppSettings({
      gameConfig: { physics: { gravity: 999 } },
      debug: { grid: 'yes' },
      terrainSmoothing: { quality: 3 },
      terrainTexture: { orientation: 'sideways' },
      cameraZoom: 99,
    });

    expect(restored.gameConfig.physics.gravity).toBe(40);
    expect(restored.debug.grid).toBe(false);
    expect(restored.terrainSmoothing.quality).toBe(4);
    expect(restored.terrainTexture.orientation).toBe('mirrored');
    expect(restored.cameraZoom).toBe(3);
  });

  it('recovers from a saved map that cannot place the batteries', () => {
    const restored = normalizeAppSettings({ gameConfig: { world: { widthMeters: 21 } } });
    expect(restored.gameConfig.world.widthMeters).toBe(360);
  });

  it('rejects an unsuccessful settings response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    try {
      await expect(saveAppSettings(createDefaultAppSettings())).rejects.toThrow('HTTP 500');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
