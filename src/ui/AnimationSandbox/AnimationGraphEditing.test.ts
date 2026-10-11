import { describe, expect, it } from 'vitest';
import type {
  BuildingAnimationKeyframe,
  BuildingAnimationTrack,
  BuildingKeyInterpolation,
} from '../../game/buildings/BuildingAnimationConfig';
import {
  keyInterpolation,
  sampleBuildingTrack,
} from '../../game/buildings/BuildingAnimationKeyframes';
import {
  animationKeyBezier,
  moveAnimationBezierHandle,
  moveAnimationGraphPoint,
  setAnimationKeyInterpolation,
  type AnimationGraphViewport,
} from './AnimationGraphEditing';

function key(
  time: number,
  value: number,
  interpolation: BuildingKeyInterpolation = 'cubic-bezier',
): BuildingAnimationKeyframe {
  return { id: `key-${time}`, time, value, interpolation, bezier: [0.2, 0.3, 0.8, 0.7] };
}

const viewport: AnimationGraphViewport = {
  left: 400,
  top: 120,
  width: 1000,
  height: 290,
  min: -50,
  range: 100,
};
// Deliberately outside the handle center: grabbing its edge must not cause a jump.
const startPointer = { x: 634, y: 178 };

describe('animation graph dragging', () => {
  it('preserves a point on an off-center grab and moves by the pointer delta', () => {
    const origin = { time: 0.23, value: 12 };
    expect(moveAnimationGraphPoint(viewport, origin, startPointer, startPointer)).toEqual(origin);
    const moved = moveAnimationGraphPoint(viewport, origin, startPointer, { x: 644, y: 174 });
    expect(moved.time).toBeCloseTo(0.24);
    expect(moved.value).toBe(14);
  });

  it.each([0, 1] as const)('preserves handle %i when the pointer has not moved', (handle) => {
    const start = key(0.2, -25);
    const end = key(0.7, 75);
    expect(
      moveAnimationBezierHandle(
        start,
        end,
        start.bezier,
        handle,
        viewport,
        startPointer,
        startPointer,
      ),
    ).toEqual(start.bezier);
  });

  it.each([
    { endValue: 100, expectedY: 0.4 },
    { endValue: -100, expectedY: 0.2 },
  ])(
    'moves rising and falling segments in screen direction ($endValue)',
    ({ endValue, expectedY }) => {
      const start = key(0.2, 0);
      const result = moveAnimationBezierHandle(
        start,
        key(0.7, endValue),
        start.bezier,
        0,
        viewport,
        startPointer,
        { x: 684, y: 158 },
      );
      expect(result[0]).toBeCloseTo(0.3);
      expect(result[1]).toBeCloseTo(expectedY);
      expect(result.slice(2)).toEqual([0.8, 0.7]);
    },
  );

  it.each([
    { handle: 0 as const, pointer: { x: 10000, y: -10000 }, expected: [1, 1, 0.8, 0.7] },
    { handle: 1 as const, pointer: { x: -10000, y: 10000 }, expected: [0.2, 0.3, 0, 0] },
  ])(
    'clamps handle $handle to its segment bounds without moving the other',
    ({ handle, pointer, expected }) => {
      const start = key(0.2, 0);
      expect(
        moveAnimationBezierHandle(
          start,
          key(0.7, 100),
          start.bezier,
          handle,
          viewport,
          startPointer,
          pointer,
        ),
      ).toEqual(expected);
    },
  );

  it.each([0, 1] as const)(
    'retains stored vertical easing on flat segments for handle %i',
    (handle) => {
      const start = key(0.2, 10);
      const result = moveAnimationBezierHandle(
        start,
        key(0.7, 10),
        start.bezier,
        handle,
        viewport,
        startPointer,
        { x: 684, y: -10000 },
      );
      expect(result[handle * 2]).toBeCloseTo(start.bezier[handle * 2]! + 0.1);
      expect(result[1]).toBe(0.3);
      expect(result[3]).toBe(0.7);
      expect(result[(1 - handle) * 2]).toBe(start.bezier[(1 - handle) * 2]);
    },
  );

  it('preserves vertical motion for a nonzero but very small value difference', () => {
    const start = key(0.2, 0);
    const result = moveAnimationBezierHandle(
      start,
      key(0.7, 0.0000001),
      start.bezier,
      0,
      { ...viewport, range: 0.0000001 },
      startPointer,
      { x: 634, y: 158 },
    );
    expect(result[1]).toBeCloseTo(0.4);
  });

  it('keeps small segment movements proportional to a zoomed graph', () => {
    const start = key(0.71, 33);
    const result = moveAnimationBezierHandle(
      start,
      key(0.715, 35),
      start.bezier,
      1,
      { ...viewport, left: -1000, width: 2000, range: 20 },
      startPointer,
      { x: 635, y: 179 },
    );
    expect(result[2]).toBeCloseTo(0.9);
    expect(result[3]).toBeCloseTo(0.65);
    expect(result.slice(0, 2)).toEqual([0.2, 0.3]);
  });

  it('protects empty viewports and coincident key times from division by zero', () => {
    expect(
      moveAnimationGraphPoint(
        { ...viewport, width: 0, height: 0, range: 10 },
        { time: 0.5, value: 7 },
        { x: 4, y: 5 },
        { x: 7, y: 8 },
      ),
    ).toEqual({ time: 3.5, value: -36.5 });
    const start = key(0.5, 10);
    const result = moveAnimationBezierHandle(
      start,
      key(0.5, 10),
      start.bezier,
      0,
      { ...viewport, width: 0, height: 0 },
      startPointer,
      { x: 635, y: 179 },
    );
    expect(result).toEqual(start.bezier);
    expect(result.every(Number.isFinite)).toBe(true);
  });

  it('leaves the original keys, curve, pointer and viewport untouched', () => {
    const start = key(0.2, 0);
    const end = key(0.7, 100);
    const before = structuredClone({ start, end, viewport, startPointer });
    const result = moveAnimationBezierHandle(start, end, start.bezier, 0, viewport, startPointer, {
      x: 684,
      y: 158,
    });
    expect(result).not.toBe(start.bezier);
    expect({ start, end, viewport, startPointer }).toEqual(before);
  });
});

describe('animation Bézier conversion', () => {
  it.each(['linear', 'ease-in', 'ease-out'] as const)(
    'preserves %s easing and the sampled track when converting to editable Bézier',
    (interpolation) => {
      const start = key(0.2, -30, interpolation);
      const track: BuildingAnimationTrack = {
        stageId: 'stage',
        property: 'x',
        keys: [start, key(0.8, 50)],
      };
      const times = [0, 0.01, 0.1, 0.25, 0.5, 0.7, 0.9, 0.99, 1];
      const easingBefore = times.map((time) => keyInterpolation(time, start));
      const samplesBefore = times.map((time) => sampleBuildingTrack(track, time, 0));
      setAnimationKeyInterpolation(start, 'cubic-bezier');
      expect(start.interpolation).toBe('cubic-bezier');
      times.forEach((time, index) => {
        expect(keyInterpolation(time, start)).toBeCloseTo(easingBefore[index]!, 5);
        expect(sampleBuildingTrack(track, time, 0)).toBeCloseTo(samplesBefore[index]!, 3);
      });
    },
  );

  it('copies an existing custom curve and retains it when selecting custom again', () => {
    const start = key(0.2, 0);
    const originalBezier = start.bezier;
    const converted = animationKeyBezier(start);
    converted[0] = 0.5;
    expect(originalBezier[0]).toBe(0.2);
    setAnimationKeyInterpolation(start, 'cubic-bezier');
    expect(start.bezier).toBe(originalBezier);
    expect(start.bezier).toEqual([0.2, 0.3, 0.8, 0.7]);
  });

  it('provides explicit approximation controls for piecewise easing and step', () => {
    expect(animationKeyBezier(key(0, 0, 'ease-in-out'))).toEqual([0.5, 0, 0.5, 1]);
    expect(animationKeyBezier(key(0, 0, 'step'))).toEqual([0, 0, 1, 1]);
  });

  it('does not rewrite stored custom controls when selecting another easing', () => {
    const start = key(0, 0);
    const bezier = start.bezier;
    setAnimationKeyInterpolation(start, 'ease-out');
    expect(start.interpolation).toBe('ease-out');
    expect(start.bezier).toBe(bezier);
  });
});
