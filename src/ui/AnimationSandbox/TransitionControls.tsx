import { useRef } from 'react';
import type { BuildingAnimationTransition } from '../../game/buildings/BuildingAnimationConfig';
import {
  buildingTransitionCatalog,
  buildingTransitionDirections,
  createDefaultBuildingTransition,
  transitionHasControl,
} from '../../game/buildings/BuildingAnimationTransitions';
import { NumericInput, TextInput } from './EditorInput';

interface Props {
  transition: BuildingAnimationTransition;
  onChange: (patch: Partial<BuildingAnimationTransition>, record?: boolean) => void;
  onRemember: () => void;
  progress: number;
  onProgress: (progress: number) => void;
}

const groups = [...new Set(buildingTransitionCatalog.map((entry) => entry.group))];

export function TransitionControls({
  transition,
  onChange,
  onRemember,
  progress,
  onProgress,
}: Props) {
  const has = (control: string) => transitionHasControl(transition.type, control);
  const range = (
    property:
      | 'softness'
      | 'strength'
      | 'segments'
      | 'angle'
      | 'centerX'
      | 'centerY'
      | 'noiseScale'
      | 'directionStrength'
      | 'edgeWidth'
      | 'edgeIntensity',
    label: string,
    min: number,
    max: number,
    step: number,
  ) => (
    <TransitionRange
      key={property}
      label={label}
      value={transition[property]}
      min={min}
      max={max}
      step={step}
      onRemember={onRemember}
      onChange={(value) => onChange({ [property]: value }, false)}
    />
  );
  return (
    <>
      <label>
        TYPE · {buildingTransitionCatalog.length} EFFECTS
        <select
          aria-label="Тип перехода"
          value={transition.type}
          onChange={(event) => {
            const type = event.target.value as BuildingAnimationTransition['type'];
            onChange({
              type,
              ...(type === 'rotate' && transition.angle === 0 ? { angle: 180 } : {}),
            });
          }}
        >
          {groups.map((group) => (
            <optgroup key={group} label={group}>
              {buildingTransitionCatalog
                .filter((entry) => entry.group === group)
                .map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="range-field transition-preview">
        <span>
          PREVIEW <b>{Math.round(Math.min(1, Math.max(0, progress)) * 100)}%</b>
        </span>
        <input
          aria-label="Позиция перехода"
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={Math.min(1, Math.max(0, progress))}
          onChange={(event) => onProgress(Number(event.target.value))}
        />
      </label>
      <div className="transition-preview-actions">
        <button onClick={() => onProgress(0)}>Начало</button>
        <button onClick={() => onProgress(0.5)}>Середина</button>
        <button onClick={() => onProgress(1)}>Конец</button>
      </div>
      {has('direction') && (
        <label>
          DIRECTION
          <select
            aria-label="Направление перехода"
            value={transition.direction}
            onChange={(event) =>
              onChange({
                direction: event.target.value as BuildingAnimationTransition['direction'],
              })
            }
          >
            {buildingTransitionDirections.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {has('reverse') && (
        <label className="transition-reverse">
          <input
            type="checkbox"
            checked={transition.reverse}
            onChange={(event) => onChange({ reverse: event.target.checked })}
          />
          REVERSE / Обратное направление
        </label>
      )}
      {has('softness') && range('softness', 'SOFTNESS', 0, 1, 0.001)}
      {has('strength') && range('strength', 'STRENGTH', 0, 2, 0.01)}
      {has('segments') && range('segments', 'SEGMENTS / DENSITY', 2, 64, 1)}
      {has('angle') && range('angle', 'ANGLE °', -360, 360, 1)}
      {has('center') && (
        <>
          {range('centerX', 'CENTER X', 0, 1, 0.01)}
          {range('centerY', 'CENTER Y', 0, 1, 0.01)}
        </>
      )}
      {has('noise') && range('noiseScale', 'NOISE SCALE', 1, 24, 0.1)}
      {((has('noise') && transition.type !== 'ink-spread') ||
        transition.type === 'random-blocks') &&
        range('directionStrength', 'DIRECTION STRENGTH', 0, 1, 0.01)}
      {has('seed') && (
        <label>
          SEED
          <NumericInput
            label="Seed перехода"
            value={transition.seed}
            min={0}
            max={65535}
            step={1}
            onCommit={(seed) => onChange({ seed: Math.round(seed) })}
          />
        </label>
      )}
      {has('edge') && (
        <>
          {range('edgeWidth', 'EDGE WIDTH', 0.001, 0.3, 0.001)}
          {range('edgeIntensity', 'EDGE INTENSITY', 0, 2, 0.01)}
        </>
      )}
      {(has('edge') || has('color')) && (
        <label>
          {has('edge') ? 'EDGE COLOR' : 'TRANSITION COLOR'}
          <TextInput
            type="color"
            value={transition.edgeColor}
            onCommit={(edgeColor) => onChange({ edgeColor })}
          />
        </label>
      )}
      <label>
        EASING
        <select
          value={transition.easing}
          onChange={(event) =>
            onChange({ easing: event.target.value as BuildingAnimationTransition['easing'] })
          }
        >
          <option value="linear">Linear</option>
          <option value="ease-in">Ease in</option>
          <option value="ease-out">Ease out</option>
          <option value="ease-in-out">Ease in/out</option>
        </select>
      </label>
      {has('edge') && (
        <label>
          EDGE BLEND MODE
          <select
            value={transition.blendMode}
            onChange={(event) =>
              onChange({
                blendMode: event.target.value as BuildingAnimationTransition['blendMode'],
              })
            }
          >
            <option value="normal">Normal</option>
            <option value="add">Add</option>
            <option value="screen">Screen</option>
            <option value="multiply">Multiply</option>
            <option value="overlay">Overlay</option>
          </select>
        </label>
      )}
      <button
        className="transition-reset"
        onClick={() => {
          const defaults: Partial<BuildingAnimationTransition> = createDefaultBuildingTransition(
            '',
            '',
          );
          delete defaults.fromStageId;
          delete defaults.toStageId;
          onChange({
            ...defaults,
            type: transition.type,
            ...(transition.type === 'rotate' ? { angle: 180 } : {}),
          });
        }}
      >
        Сбросить параметры перехода
      </button>
      <small>
        Переход действует между milestones выбранной пары. Параметры сохраняются в JSON и общем
        Undo/Redo.
      </small>
    </>
  );
}

function TransitionRange({
  label,
  value,
  min,
  max,
  step,
  onRemember,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onRemember: () => void;
  onChange: (value: number) => void;
}) {
  const recorded = useRef(false);
  return (
    <label className="range-field">
      <span>
        {label}
        <b>{value.toFixed(step < 0.01 ? 3 : step < 1 ? 2 : 0)}</b>
      </span>
      <input
        type="range"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onPointerDown={() => {
          recorded.current = false;
        }}
        onKeyDown={(event) => {
          if (!event.repeat) recorded.current = false;
        }}
        onBlur={() => {
          recorded.current = false;
        }}
        onChange={(event) => {
          if (!recorded.current) {
            onRemember();
            recorded.current = true;
          }
          onChange(Number(event.target.value));
        }}
      />
    </label>
  );
}
