import type { BuildingAnimationConfig } from './BuildingAnimationConfig';
import type { Vec2 } from '../math/Vec2';

export interface BuildingAnimationPreview {
  config: BuildingAnimationConfig;
  progress: number;
  visible: boolean;
  onionSkinStageIndex: number | null;
  sourceUrls: Readonly<Record<string, string>>;
  sourceRevision: number;
  position: Vec2 | null;
  opacity: number;
  showHitbox: boolean;
}
