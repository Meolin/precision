import { describe, expect, it } from 'vitest';
import {
  createDefaultBuildingAnimationConfig,
  loadBuildingAnimationConfig,
  validateBuildingAnimationConfig,
} from './BuildingAnimationConfig';
import { createAnimationEffectStage } from './BuildingAnimationEffects';
import { createParticlePlan, sampleParticleFrame } from './BuildingAnimationParticles';
import { editAnimationValue } from '../../ui/AnimationSandbox/AnimationEditing';
function setup() {
  const config = createDefaultBuildingAnimationConfig();
  const stage = createAnimationEffectStage(config, 'particles', 'particles', 'sparks');
  config.stages.push(stage);
  return { config, stage };
}
describe('particle lifecycle', () => {
  it('emits an exact burst at the cursor and drains it after the clip', () => {
    const { config, stage } = setup();
    Object.assign(stage, {
      inPoint: 0.2,
      outPoint: 0.25,
      emissionStart: 0.2,
      emissionMode: 'burst',
      burstCount: 12,
      fxLifetime: 1,
    });
    const plan = createParticlePlan(config, stage);
    expect(sampleParticleFrame(config, stage, 0.199, plan).alive).toBe(0);
    expect(sampleParticleFrame(config, stage, 0.2, plan).alive).toBe(12);
    expect(sampleParticleFrame(config, stage, 0.3, plan).alive).toBe(12);
    stage.endBehavior = 'cut';
    expect(sampleParticleFrame(config, stage, 0.3, plan).alive).toBe(0);
    stage.endBehavior = 'fade';
    expect(sampleParticleFrame(config, stage, 0.38, plan).alive).toBe(0);
  });
  it('integrates a low emission rate instead of rounding it up to candidates', () => {
    const { config, stage } = setup();
    Object.assign(stage, { fxRate: 1, fxLifetime: 10 });
    const plan = createParticlePlan(config, stage);
    expect(sampleParticleFrame(config, stage, 0.24, plan).alive).toBe(0);
    expect(sampleParticleFrame(config, stage, 0.5, plan).alive).toBe(2);
  });
  it('rejects births at the limit without removing living particles', () => {
    const { config, stage } = setup();
    Object.assign(stage, { fxRate: 10, fxLifetime: 10, particleBudget: 3 });
    const plan = createParticlePlan(config, stage);
    const first = sampleParticleFrame(config, stage, 0.1, plan),
      later = sampleParticleFrame(config, stage, 0.2, plan);
    expect(later.particles.map((particle) => particle.id)).toEqual(
      first.particles.map((particle) => particle.id),
    );
    expect(later.alive).toBe(3);
    expect(later.rejected).toBe(5);
  });
  it('leaves composition particles behind when the emitter moves', () => {
    const { config, stage } = setup();
    Object.assign(stage, {
      emissionMode: 'burst',
      burstCount: 1,
      fxLifetime: 10,
      fxSpeed: 0,
      fxGravity: 0,
    });
    editAnimationValue(config, stage.id, 'x', 0, 0, false, true, () => 'start');
    editAnimationValue(config, stage.id, 'x', 100, 1, false, true, () => 'end');
    const plan = createParticlePlan(config, stage);
    expect(sampleParticleFrame(config, stage, 0.5, plan).particles[0]!.x).toBe(0);
  });
  it('imports v8 particles with their original local space and hard cut', () => {
    const { config, stage } = setup();
    const imported = loadBuildingAnimationConfig({ ...config, schemaVersion: 8 });
    const migrated = imported.stages.find((item) => item.id === stage.id)!;
    expect(migrated.particleSpace).toBe('local');
    expect(migrated.endBehavior).toBe('cut');
    expect(validateBuildingAnimationConfig(imported).valid).toBe(true);
  });
  it('retains authored blur strength tracks when importing v8', () => {
    const { config, stage } = setup();
    const blur = createAnimationEffectStage(config, 'blur', 'filter', 'blur', stage.id);
    config.stages.push(blur);
    editAnimationValue(config, blur.id, 'fxStrength', 3, 0.5, false, true, () => 'blur-key');
    const imported = loadBuildingAnimationConfig({ ...config, schemaVersion: 8 });
    expect(imported.tracks.at(-1)!.keys[0]!.value).toBe(3);
    expect(validateBuildingAnimationConfig(imported).valid).toBe(true);
  });
});
