import type { RecentExplosion } from '../core/GameRuntime';
import type { Vec2 } from '../math/Vec2';
import type { TerrainGlowSource } from './TerrainGlowSource';
import { shaderValue, type ShaderSettings } from './ShaderSettings';
import type {
  TerrainLightSource,
  TerrainLightingBlendMode,
  TerrainLightingDisplay,
  TerrainLightingSettings,
} from './TerrainLightingSettings';

/** Renderer-only lights; time is supplied by the presentation clock. */
export function createSceneLighting(
  settings: ShaderSettings,
  cursor: Vec2 | null,
  explosions: readonly RecentExplosion[],
  time: number,
  entityLights: readonly TerrainLightSource[],
  entityGlows: readonly TerrainGlowSource[] = [],
): TerrainLightingSettings {
  const enabled = (id: 'terrainLighting' | 'lightmap') =>
    settings.enabled && settings.effects[id].enabled;
  const value = (id: 'terrainLighting' | 'lightmap', key: string) => shaderValue(settings, id, key);
  const lights: TerrainLightSource[] = settings.enabled ? [...entityLights] : [];
  if (enabled('terrainLighting') && cursor)
    lights.push({
      position: [cursor.x, cursor.y],
      intensity: value('terrainLighting', 'intensity'),
      radius: value('terrainLighting', 'radius'),
      color: value('terrainLighting', 'lightColor'),
    });
  if (enabled('lightmap'))
    for (const item of explosions) {
      const age = Math.max(0, time - item.timeSeconds);
      if (age >= 0.65) continue;
      const { x, y } = item.event.resolution.explosion.position;
      lights.push({
        position: [x, y],
        intensity: value('lightmap', 'flash') * (1 - age / 0.65),
        radius: value('lightmap', 'radius'),
        color: 0xffd291,
      });
    }
  const displays: readonly TerrainLightingDisplay[] = ['final', 'albedo', 'height', 'normal'];
  const blends: readonly TerrainLightingBlendMode[] = ['multiply', 'add', 'screen'];
  return {
    enabled:
      settings.enabled &&
      (enabled('terrainLighting') || lights.length > 0 || entityGlows.length > 0),
    normalStrength: value('terrainLighting', 'normalStrength'),
    ambient: enabled('terrainLighting') ? value('terrainLighting', 'ambient') : 1,
    blendMode: blends[value('terrainLighting', 'blendMode')] ?? 'multiply',
    display: displays[value('terrainLighting', 'display')] ?? 'final',
    lights,
    glows: settings.enabled ? entityGlows : [],
    normalGlow: {
      enabled: settings.enabled && settings.effects.normalGlow.enabled,
      strength: shaderValue(settings, 'normalGlow', 'strength'),
      radius: shaderValue(settings, 'normalGlow', 'radius'),
      threshold: shaderValue(settings, 'normalGlow', 'threshold'),
      softness: shaderValue(settings, 'normalGlow', 'softness'),
      opacity: shaderValue(settings, 'normalGlow', 'visualOpacity'),
      color: shaderValue(settings, 'normalGlow', 'color'),
    },
  };
}
