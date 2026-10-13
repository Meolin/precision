import type { BuildingAnimationConfig } from './BuildingAnimationConfig';
import { animationStageSampler, animationStageVisible } from './BuildingAnimationParticles';
import {
  animationColor,
  animationResourceEnabled,
  resourceMatrix,
} from './BuildingAnimationTransform';
import type { TerrainLightSource } from '../rendering/TerrainLightingSettings';

export interface BuildingLightPlacement {
  position: readonly [number, number];
  scale: readonly [number, number];
  opacity: number;
}

/** Aura remains a radial source; dependent Glow uses BuildingGlowMasks instead. */
export function sampleBuildingAnimationLights(
  config: BuildingAnimationConfig,
  progress: number,
  placement: BuildingLightPlacement,
): TerrainLightSource[] {
  const lights: TerrainLightSource[] = [];
  for (const stage of config.stages) {
    if (
      stage.kind !== 'light' ||
      !animationStageVisible(stage, progress) ||
      !animationResourceEnabled(config, stage)
    )
      continue;
    const sample = animationStageSampler(config, stage);
    const value = (property: Parameters<typeof sample>[0]) => sample(property, progress);
    const matrix = resourceMatrix(config, stage.id, progress);
    const [sx, sy] = placement.scale;
    const a = matrix.a * sx,
      b = matrix.b * sy,
      c = matrix.c * sx,
      d = matrix.d * sy;
    const trace = a * a + b * b + c * c + d * d;
    const determinant = a * d - b * c;
    const scale = Math.sqrt(
      (trace + Math.sqrt(Math.max(0, trace * trace - 4 * determinant * determinant))) / 2,
    );
    const intensity = value('fxStrength') * value('opacity') * placement.opacity;
    const radius = value('fxRadius') * scale;
    if (!(intensity > 0 && radius > 0)) continue;
    lights.push({
      position: [
        placement.position[0] + (matrix.x - config.origin.x) * sx,
        placement.position[1] + (matrix.y - config.origin.y) * sy,
      ],
      radius,
      intensity,
      color: animationColor(value),
    });
  }
  return lights;
}
