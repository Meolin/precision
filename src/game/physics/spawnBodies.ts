import type { GameConfig } from '../config/GameConfig';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import type { BodyState } from './Body';

/** Six reproducible samples are placed in the initial camera view, above the current surface. */
export function spawnBodies(
  terrain: TerrainGrid,
  config: GameConfig,
  firstId: number,
): BodyState[] {
  const center = config.world.widthMeters * 0.25;
  const samples = [
    {
      x: -20,
      rise: 12,
      vx: 1.2,
      shape: { type: 'circle', radius: 0.8 },
      massKg: 4,
      friction: 0.8,
      restitution: 0.05,
      color: 0xd5ec84,
    },
    {
      x: -17,
      rise: 19,
      vx: -1.1,
      shape: { type: 'circle', radius: 0.65 },
      massKg: 1,
      friction: 0.25,
      restitution: 0.65,
      color: 0x85d7e8,
    },
    {
      x: -14,
      rise: 26,
      vx: 0.5,
      shape: { type: 'circle', radius: 1 },
      massKg: 12,
      friction: 0.5,
      restitution: 0.25,
      color: 0xf5af73,
    },
    {
      x: 4,
      rise: 12,
      vx: 0.9,
      shape: { type: 'box', halfWidth: 0.85, halfHeight: 0.85 },
      massKg: 3,
      friction: 0.9,
      restitution: 0.02,
      color: 0xed85ac,
    },
    {
      x: 7,
      rise: 19,
      vx: -1.3,
      shape: { type: 'box', halfWidth: 0.7, halfHeight: 0.7 },
      massKg: 2,
      friction: 0.3,
      restitution: 0.55,
      color: 0xb8a4eb,
    },
    {
      x: 10,
      rise: 26,
      vx: 0.4,
      shape: { type: 'box', halfWidth: 1.05, halfHeight: 1.05 },
      massKg: 15,
      friction: 0.65,
      restitution: 0.15,
      color: 0xe8c777,
    },
  ] as const;
  return samples.map((sample, index): BodyState => {
    const x = center + sample.x;
    const surface = terrain.findSurfaceY(x) ?? config.world.heightMeters * 0.7;
    const position = { x, y: Math.max(2, surface - sample.rise) };
    return {
      id: firstId + index,
      kind: 'dynamic',
      shape: { ...sample.shape },
      massKg: sample.massKg,
      position,
      previousPosition: { ...position },
      velocity: { x: sample.vx, y: 0 },
      rotationRad: 0,
      previousRotationRad: 0,
      angularVelocityRadPerSecond: 0,
      friction: sample.friction,
      restitution: sample.restitution,
      sleeping: false,
      sleepSeconds: 0,
      color: sample.color,
    };
  });
}
