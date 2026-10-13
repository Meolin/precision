import { describe, expect, it } from 'vitest';
import { defaultExplosionDefinition } from '../explosions/ExplosionDefinition';
import { createExplosionEvent } from '../explosions/ExplosionEvent';
import type { RecentExplosion } from '../core/GameRuntime';
import { createSceneLighting } from './SceneLighting';
import { createShaderSettings, withShaderValue } from './ShaderSettings';
import {
  maxTerrainLights,
  terrainLightsForBounds,
  type TerrainLightSource,
} from './TerrainLightingSettings';

const explosion: RecentExplosion = {
  timeSeconds: 1,
  event: {
    type: 'explosionResolved',
    tick: 1,
    entitiesDamaged: 0,
    maxDealt: 0,
    removedCells: 0,
    resolution: {
      explosion: createExplosionEvent(
        { tick: 1, projectileId: 1, position: { x: 4, y: 5 } },
        defaultExplosionDefinition,
      ),
      affectedEntities: [],
      entityDamageEvents: [],
    },
  },
};
const entity: TerrainLightSource = { position: [6, 7], radius: 3, intensity: 2, color: 0x80ff00 };

describe('scene normal lighting', () => {
  it('does not dim terrain illumination when visual overlays are transparent', () => {
    let settings = createShaderSettings();
    const before = createSceneLighting(settings, { x: 1, y: 2 }, [explosion], 1, [entity]);
    for (const id of ['glow', 'bloom', 'lightmap'] as const)
      settings = withShaderValue(settings, id, 'visualOpacity', 0);
    expect(createSceneLighting(settings, { x: 1, y: 2 }, [explosion], 1, [entity])).toEqual(before);
  });

  it('combines keyed entity lights, cursor and fading explosions without changing inputs', () => {
    const settings = withShaderValue(createShaderSettings(), 'lightmap', 'flash', 2);
    const before = structuredClone({ settings, explosion, entity });
    const result = createSceneLighting(settings, { x: 1, y: 2 }, [explosion], 1.325, [entity]);
    expect(result.lights).toHaveLength(3);
    expect(result.lights[0]).toEqual(entity);
    expect(result.lights[1]?.position).toEqual([1, 2]);
    expect(result.lights[2]?.position).toEqual([4, 5]);
    expect(result.lights[2]?.intensity).toBeCloseTo(1);
    expect({ settings, explosion, entity }).toEqual(before);
    expect(createSceneLighting(settings, null, [explosion], 2, []).lights).toEqual([]);
  });

  it('keeps entity and explosion lighting when cursor lighting is off and respects global toggles', () => {
    const settings = createShaderSettings();
    settings.effects.terrainLighting.enabled = false;
    expect(createSceneLighting(settings, { x: 1, y: 2 }, [explosion], 1, [entity])).toMatchObject({
      enabled: true,
      ambient: 1,
      lights: [entity, expect.objectContaining({ position: [4, 5] })],
    });
    settings.effects.lightmap.enabled = false;
    expect(createSceneLighting(settings, null, [explosion], 1, [entity]).lights).toEqual([entity]);
    settings.enabled = false;
    expect(createSceneLighting(settings, { x: 1, y: 2 }, [explosion], 1, [entity])).toMatchObject({
      enabled: false,
      lights: [],
    });
  });

  it('culls by radius intersection rather than source center and bounds local GPU work', () => {
    const near: TerrainLightSource = { ...entity, position: [-1, 4], radius: 2 };
    const far: TerrainLightSource = { ...entity, position: [50, 50] };
    const invalid: TerrainLightSource = { ...entity, radius: NaN };
    expect(terrainLightsForBounds([near, far, invalid], [0, 0], [8, 8])).toEqual([near]);
    const crowd = Array.from({ length: maxTerrainLights + 1 }, (_, i) => ({
      ...entity,
      intensity: i + 1,
    }));
    const selected = terrainLightsForBounds(crowd, [0, 0], [8, 8]);
    expect(selected).toHaveLength(maxTerrainLights);
    expect(selected).not.toContain(crowd[0]);
  });
});
