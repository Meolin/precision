import { describe, expect, it } from 'vitest';
import {
  createDefaultBuildingAnimationConfig,
  validateBuildingAnimationConfig,
} from '../../game/buildings/BuildingAnimationConfig';
import { createAnimationEffectStage } from '../../game/buildings/BuildingAnimationEffects';
import { editAnimationValue } from './AnimationEditing';
import {
  applyAnimationPreset,
  captureAnimationPreset,
  changeEffectCenterSpace,
  duplicateAnimationResource,
  moveAnimationClip,
} from './AnimationEffectEditing';
function setup() {
  const config = createDefaultBuildingAnimationConfig(),
    root = createAnimationEffectStage(config, 'emitter', 'particles', 'smoke', undefined, 0.2);
  root.outPoint = 0.6;
  config.stages.push(root);
  const glow = createAnimationEffectStage(config, 'glow', 'filter', 'glow', root.id, 0.25);
  config.stages.push(glow);
  editAnimationValue(config, root.id, 'x', 5, 0.3, false, true, () => 'position');
  editAnimationValue(config, glow.id, 'fxStrength', 2, 0.4, false, true, () => 'strength');
  return { config, root, glow };
}
describe('effect editing', () => {
  it('moves a clip, child effects, all keys and emission phase together', () => {
    const { config, root, glow } = setup();
    moveAnimationClip(config, root.id, 0.1);
    expect(root.inPoint).toBeCloseTo(0.3);
    expect(root.emissionStart).toBeCloseTo(0.3);
    expect(glow.inPoint).toBeCloseTo(0.35);
    expect(config.tracks.map((track) => track.keys[0]!.time)).toEqual([0.4, 0.5]);
    expect(validateBuildingAnimationConfig(config).valid).toBe(true);
  });
  it('duplicates a generator with new stage and key IDs and working dependencies', () => {
    const { config, root } = setup(),
      id = duplicateAnimationResource(config, root.id)!;
    expect(id).not.toBe(root.id);
    expect(config.stages.some((stage) => stage.parentId === id)).toBe(true);
    expect(new Set(config.tracks.flatMap((track) => track.keys.map((key) => key.id))).size).toBe(4);
    expect(validateBuildingAnimationConfig(config).valid).toBe(true);
  });
  it('round trips a preset in seconds at the cursor', () => {
    const { config, root } = setup(),
      preset = captureAnimationPreset(config, root.id, 'Smoke')!;
    config.effectPresets = [preset];
    const id = applyAnimationPreset(config, preset, 0.5)!;
    const copy = config.stages.find((stage) => stage.id === id)!;
    expect(copy.inPoint).toBeCloseTo(0.5);
    expect(copy.outPoint).toBeCloseTo(0.9);
    expect(validateBuildingAnimationConfig(config).valid).toBe(true);
  });
  it('clamps strength against the chosen filter type', () => {
    const { config, root } = setup(),
      distort = createAnimationEffectStage(config, 'distort', 'filter', 'distort', root.id);
    config.stages.push(distort);
    editAnimationValue(config, distort.id, 'fxStrength', 10, 0.2, false, true, () => 'deformation');
    expect(config.tracks.at(-1)!.keys[0]!.value).toBe(1);
  });
  it('preserves authored centers when changing local/composition space', () => {
    const { config, root } = setup();
    root.x = 100;
    root.y = 20;
    root.scaleX = root.scaleY = 1;
    root.pivotX = root.pivotY = 0;
    config.tracks = [];
    const distort = createAnimationEffectStage(config, 'distort', 'filter', 'distort', root.id);
    distort.x = 150;
    distort.y = 30;
    config.stages.push(distort);
    changeEffectCenterSpace(config, distort, 'local', 0);
    expect(distort.x).toBe(50);
    expect(distort.y).toBe(10);
    changeEffectCenterSpace(config, distort, 'composition', 0);
    expect(distort.x).toBe(150);
    expect(distort.y).toBe(30);
  });
});
