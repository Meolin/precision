import { describe, expect, it, vi } from 'vitest';
import { createDefaultAppSettings, normalizeAppSettings, saveAppSettings } from './AppSettings';

describe('app settings persistence', () => {
  it('restores normal glow controls and supplies defaults to older settings files', () => {
    const saved = createDefaultAppSettings();
    saved.shaders.effects.normalGlow = {
      enabled: false,
      values: {
        strength: 2.1,
        radius: 12,
        threshold: 1.2,
        softness: 0,
        visualOpacity: 0.3,
        color: 0x80ffcc,
      },
    };
    expect(
      normalizeAppSettings(JSON.parse(JSON.stringify(saved))).shaders.effects.normalGlow,
    ).toEqual(saved.shaders.effects.normalGlow);
    const legacyEffects: Partial<typeof saved.shaders.effects> = { ...saved.shaders.effects };
    delete legacyEffects.normalGlow;
    const legacy = normalizeAppSettings({
      ...saved,
      shaders: { ...saved.shaders, effects: legacyEffects },
    });
    expect(legacy.shaders.effects.normalGlow).toEqual(
      createDefaultAppSettings().shaders.effects.normalGlow,
    );
  });

  it('restores visual opacity independently and keeps old files visually unchanged', () => {
    const saved = createDefaultAppSettings();
    for (const id of ['glow', 'bloom', 'lightmap'] as const)
      saved.shaders.effects[id].values.visualOpacity = 0;
    const restored = normalizeAppSettings(JSON.parse(JSON.stringify(saved)));
    for (const id of ['glow', 'bloom', 'lightmap'] as const) {
      expect(restored.shaders.effects[id].values.visualOpacity).toBe(0);
      delete saved.shaders.effects[id].values.visualOpacity;
    }
    expect(restored.shaders.effects.glow.values.strength).toBe(
      saved.shaders.effects.glow.values.strength,
    );
    expect(restored.shaders.effects.lightmap.values.flash).toBe(
      saved.shaders.effects.lightmap.values.flash,
    );
    const legacy = normalizeAppSettings(JSON.parse(JSON.stringify(saved)));
    for (const id of ['glow', 'bloom', 'lightmap'] as const)
      expect(legacy.shaders.effects[id].values.visualOpacity).toBe(1);
  });

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
