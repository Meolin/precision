import type { TerrainGlowSource } from './TerrainGlowSource';

export type TerrainLightingDisplay = 'final' | 'albedo' | 'height' | 'normal';
export type TerrainLightingBlendMode = 'multiply' | 'add' | 'screen';

export interface TerrainLightSource {
  position: readonly [number, number];
  radius: number;
  intensity: number;
  color: number;
}

// Cull per chunk before uploading, so distant lights do not consume GPU slots.
export const maxTerrainLights = 32;

export function terrainLightsForBounds(
  lights: readonly TerrainLightSource[],
  origin: readonly [number, number],
  size: readonly [number, number],
): TerrainLightSource[] {
  return lights
    .flatMap((light) => {
      const [x, y] = light.position;
      if (
        ![x, y, light.radius, light.intensity].every(Number.isFinite) ||
        light.radius <= 0 ||
        light.intensity <= 0
      )
        return [];
      const dx = Math.max(origin[0] - x, 0, x - origin[0] - size[0]);
      const dy = Math.max(origin[1] - y, 0, y - origin[1] - size[1]);
      const distance = Math.hypot(dx, dy);
      if (distance >= light.radius) return [];
      return [{ light, contribution: light.intensity * (1 - distance / light.radius) }];
    })
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, maxTerrainLights)
    .map(({ light }) => light);
}

export interface TerrainLightingSettings {
  enabled: boolean;
  normalStrength: number;
  ambient: number;
  blendMode: TerrainLightingBlendMode;
  display: TerrainLightingDisplay;
  lights: readonly TerrainLightSource[];
  glows: readonly TerrainGlowSource[];
  normalGlow?: {
    enabled: boolean;
    strength: number;
    radius: number;
    threshold: number;
    softness: number;
    opacity: number;
    color: number;
  };
}
