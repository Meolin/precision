import { useState } from 'react';
import {
  createShaderSettings,
  shaderDefinitions,
  shaderValue,
  withShaderValue,
  type ShaderSettings,
  type ShaderControl,
} from '../../game/rendering/ShaderSettings';

function ShaderNumberInput({
  id,
  control,
  value,
  onChange,
}: {
  id: string;
  control: ShaderControl;
  value: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  return (
    <input
      id={id}
      type="number"
      min={control.min}
      max={control.max}
      step={control.step}
      value={focused ? draft : value}
      onFocus={() => {
        setFocused(true);
        setDraft(String(value));
      }}
      onChange={(event) => {
        setDraft(event.target.value);
        const number = event.currentTarget.valueAsNumber;
        if (Number.isFinite(number) && number >= control.min && number <= control.max)
          onChange(number);
      }}
      onBlur={() => {
        if (draft.trim() !== '' && Number.isFinite(Number(draft))) onChange(Number(draft));
        setFocused(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

export function ShaderControls({
  settings,
  onChange,
}: {
  settings: ShaderSettings;
  onChange: (settings: ShaderSettings) => void;
}) {
  return (
    <div className="shader-controls">
      <label className="check-row">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(event) => onChange({ ...settings, enabled: event.target.checked })}
        />
        <span>Включить постобработку</span>
      </label>
      <button
        className="shader-reset"
        type="button"
        onClick={() => onChange(createShaderSettings())}
      >
        Сбросить настройки шейдеров
      </button>
      {shaderDefinitions.map((effect) => (
        <details className="shader-group" key={effect.id}>
          <summary>
            <span>{effect.title}</span>
            <span
              className={
                settings.enabled && settings.effects[effect.id].enabled
                  ? 'shader-status is-on'
                  : 'shader-status'
              }
            >
              {settings.enabled && settings.effects[effect.id].enabled ? 'ВКЛ' : 'ВЫКЛ'}
            </span>
          </summary>
          <label className="check-row">
            <input
              type="checkbox"
              aria-label={`Включить: ${effect.title}`}
              checked={settings.effects[effect.id].enabled}
              onChange={(event) =>
                onChange({
                  ...settings,
                  effects: {
                    ...settings.effects,
                    [effect.id]: { ...settings.effects[effect.id], enabled: event.target.checked },
                  },
                })
              }
            />
            <span>Включить эффект</span>
          </label>
          <p className="settings-note">{effect.description}</p>
          {effect.controls.map((control) => {
            const value = shaderValue(settings, effect.id, control.key);
            const id = `shader-${effect.id}-${control.key}`;
            const update = (next: number) =>
              onChange(withShaderValue(settings, effect.id, control.key, next));
            return (
              <div className="numeric-control" key={control.key}>
                <div className="numeric-row">
                  <label htmlFor={id}>{control.label}</label>
                  {control.color ? (
                    <input
                      className="shader-color"
                      id={id}
                      type="color"
                      value={`#${value.toString(16).padStart(6, '0')}`}
                      onChange={(event) => update(parseInt(event.target.value.slice(1), 16))}
                    />
                  ) : (
                    <div className="numeric-field">
                      <ShaderNumberInput
                        id={id}
                        control={control}
                        value={value}
                        onChange={update}
                      />
                      <span>{control.unit}</span>
                    </div>
                  )}
                </div>
                {!control.color && (
                  <input
                    className="value-slider"
                    type="range"
                    aria-label={`${effect.title}: ${control.label}`}
                    min={control.min}
                    max={control.max}
                    step={control.step}
                    value={value}
                    onChange={(event) => update(event.currentTarget.valueAsNumber)}
                  />
                )}
              </div>
            );
          })}
        </details>
      ))}
    </div>
  );
}
