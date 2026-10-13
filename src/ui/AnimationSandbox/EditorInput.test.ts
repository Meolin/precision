// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { NumericInput } from './EditorInput';
import { AnimationLayerDeleteButton } from './AnimationLayerDeleteButton';
import { createDefaultBuildingAnimationConfig } from '../../game/buildings/BuildingAnimationConfig';
import { createAnimationEffectStage } from '../../game/buildings/BuildingAnimationEffects';
import {
  editAnimationValue,
  insertAnimationKeyframe,
  sampleAnimationStage,
} from './AnimationEditing';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
const input = () => container.querySelector('input')!;
const button = (label: string) =>
  container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
function type(value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), value);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function press(key: string, shiftKey = false) {
  act(() => input().dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true })));
}
function mount(options: Partial<Parameters<typeof NumericInput>[0]> = {}) {
  const onCommit = vi.fn();
  function Harness() {
    const [value, setValue] = useState(options.value ?? 1);
    return createElement(NumericInput, {
      label: 'Strength',
      step: 0.05,
      min: 0,
      max: 10,
      ...options,
      value,
      onCommit: (next) => {
        onCommit(next);
        setValue(next);
      },
    });
  }
  act(() => root.render(createElement(Harness)));
  return onCommit;
}

describe('numeric inspector controls', () => {
  it('commits arrow clicks without focusing the input and supports repeated clicks', () => {
    const committed = mount();
    act(() => button('Увеличить Strength').click());
    expect(input().value).toBe('1.05');
    expect(committed).toHaveBeenLastCalledWith(1.05);
    expect(document.activeElement).not.toBe(input());
    act(() => button('Увеличить Strength').click());
    act(() => button('Уменьшить Strength').click());
    expect(committed.mock.calls.map(([value]) => value)).toEqual([1.05, 1.1, 1.05]);
  });
  it('commits keyboard steps immediately, applies Shift and clamps to bounds', () => {
    const committed = mount({ value: 0.1 });
    act(() => input().focus());
    press('ArrowUp');
    expect(committed).toHaveBeenLastCalledWith(0.15);
    press('ArrowDown', true);
    expect(input().value).toBe('0');
    expect(committed).toHaveBeenLastCalledWith(0);
    press('ArrowDown');
    act(() => input().blur());
    expect(committed).toHaveBeenCalledTimes(2);
  });
  it('keeps typing as a draft and cancels it with Escape', () => {
    const committed = mount();
    act(() => input().focus());
    type('3.5');
    expect(committed).not.toHaveBeenCalled();
    press('Escape');
    expect(input().value).toBe('1');
    expect(committed).not.toHaveBeenCalled();
    act(() => input().focus());
    type('3.5');
    press('Enter');
    expect(committed).toHaveBeenCalledExactlyOnceWith(3.5);
  });
  it('steps from the pending draft and does not commit it again on blur', () => {
    const committed = mount();
    act(() => input().focus());
    type('2.5');
    act(() => button('Увеличить Strength').click());
    expect(committed).toHaveBeenCalledExactlyOnceWith(2.55);
    act(() => input().blur());
    expect(committed).toHaveBeenCalledTimes(1);
  });
  it('rejects an empty draft and blocks disabled controls', () => {
    const committed = mount();
    act(() => input().focus());
    type('');
    act(() => input().blur());
    expect(input().value).toBe('1');
    expect(committed).not.toHaveBeenCalled();
    const disabledCommit = mount({ disabled: true });
    act(() => button('Увеличить Strength').click());
    expect(disabledCommit).not.toHaveBeenCalled();
  });
  it('inserts a draft as a key with auto-key off, preserves the base and updates the same key', () => {
    let config = createDefaultBuildingAnimationConfig();
    const stage = createAnimationEffectStage(config, 'aura', 'light');
    config.stages.push(stage);
    function Harness() {
      const [current, setConfig] = useState(config);
      const update = (keyed: boolean, value: number) => {
        config = structuredClone(current);
        if (keyed) insertAnimationKeyframe(config, stage.id, 'fxStrength', 0.1234, true, value);
        else editAnimationValue(config, stage.id, 'fxStrength', value, 0.1234, true, false);
        setConfig(config);
      };
      return createElement(NumericInput, {
        label: 'Strength',
        value: sampleAnimationStage(current, stage.id, 0.125)!.fxStrength!,
        onCommit: (value) => update(false, value),
        keyframe: {
          active: !!current.tracks.length,
          animated: !!current.tracks.length,
          onInsert: (value) => update(true, value),
        },
      });
    }
    act(() => root.render(createElement(Harness)));
    act(() => input().focus());
    type('3.5');
    act(() => button('Ключевой кадр: Strength').click());
    expect(config.tracks[0]!.keys[0]!.value).toBe(3.5);
    expect(config.tracks[0]!.keys[0]!.time).toBeCloseTo(0.125);
    expect(config.stages.at(-1)!.fxStrength).toBe(1);
    const id = config.tracks[0]!.keys[0]!.id;
    type('4');
    act(() => button('Ключевой кадр: Strength').click());
    act(() => input().blur());
    expect(config.tracks[0]!.keys).toHaveLength(1);
    expect(config.tracks[0]!.keys[0]!.id).toBe(id);
    expect(config.tracks[0]!.keys[0]!.value).toBe(4);
    expect(button('Ключевой кадр: Strength').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('layer delete icon', () => {
  it('deletes only its own layer without selecting the row and blocks disabled actions', () => {
    const onDelete = vi.fn(),
      onSelect = vi.fn();
    const render = (disabled: boolean) =>
      act(() =>
        root.render(
          createElement(
            'div',
            { onClick: onSelect },
            createElement(AnimationLayerDeleteButton, { name: 'Aura', disabled, onDelete }),
          ),
        ),
      );
    render(false);
    act(() => button('Удалить слой Aura').click());
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
    expect(button('Удалить слой Aura').querySelector('svg')).not.toBeNull();
    render(true);
    act(() => button('Удалить слой Aura').click());
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
