export type TerrainLightingDisplay = 'final' | 'albedo' | 'height' | 'normal';
export type TerrainLightingBlendMode = 'multiply' | 'add' | 'screen';

export interface TerrainLightingSettings {
  enabled: boolean;
  intensity: number;
  radius: number;
  normalStrength: number;
  ambient: number;
  color: number;
  blendMode: TerrainLightingBlendMode;
  display: TerrainLightingDisplay;
  position: readonly [number, number];
}
