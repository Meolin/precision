import { useState } from 'react';
import {
  numericSettings,
  settingValue,
  type EditableSection,
  type GameConfig,
  type NumericSetting,
} from '../../game/config/GameConfig';
import type { DebugOptions } from '../../game/rendering/DebugOptions';
import type { GameRuntime } from '../../game/core/GameRuntime';
import type { WeaponId } from '../../game/weapons/WeaponDefinition';
import { isWeaponId, weaponDefinitions } from '../../game/weapons/weaponDefinitions';
import {
  weaponNumericSettings,
  weaponSettingValue,
  type WeaponNumericSetting,
} from '../../game/weapons/WeaponSettings';
import { formatNumber, useTelemetry } from '../useTelemetry';
import './TechnicalPanel.css';

interface Props {
  runtime: GameRuntime;
  config: GameConfig;
  debug: DebugOptions;
  paused: boolean;
  onSetting: (setting: NumericSetting, value: number) => void;
  onWeaponSetting: (id: WeaponId, setting: WeaponNumericSetting, value: number) => void;
  onDebug: (key: keyof DebugOptions, value: boolean) => void;
  onPause: () => void;
  onStep: () => void;
  onReset: () => void;
  onResetSettings: () => void;
}

function NumericControl({
  setting,
  value,
  onChange,
}: {
  setting: NumericSetting | WeaponNumericSetting;
  value: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const id = `${setting.section}-${setting.key}`;
  return (
    <div className="numeric-row">
      <label htmlFor={id}>{setting.label}</label>
      <div className="numeric-field">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={setting.min}
          max={setting.max}
          step={setting.step}
          value={focused ? draft : value}
          onFocus={() => {
            setFocused(true);
            setDraft(String(value));
          }}
          onChange={(event) => {
            const text = event.target.value;
            setDraft(text);
            const number = event.target.valueAsNumber;
            if (
              text !== '' &&
              Number.isFinite(number) &&
              number >= setting.min &&
              number <= setting.max
            )
              onChange(number);
          }}
          onBlur={() => {
            const number = Number(draft);
            if (draft.trim() !== '' && Number.isFinite(number)) onChange(number);
            setFocused(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          aria-describedby={`${id}-unit`}
        />
        <span id={`${id}-unit`}>{setting.unit}</span>
      </div>
    </div>
  );
}

const groups: { section: EditableSection; title: string; number: string }[] = [
  { section: 'simulation', title: 'Симуляция', number: '01' },
  { section: 'physics', title: 'Физика мира', number: '02' },
];
const debugLabels: { key: keyof DebugOptions; label: string }[] = [
  { key: 'trajectory', label: 'Прогноз траектории' },
  { key: 'velocity', label: 'Вектор скорости' },
  { key: 'impact', label: 'Маркер попадания' },
  { key: 'grid', label: 'Сетка рельефа' },
  { key: 'samples', label: 'Точки проверки столкновений' },
];

export function TechnicalPanel({
  runtime,
  config,
  debug,
  paused,
  onSetting,
  onWeaponSetting,
  onDebug,
  onPause,
  onStep,
  onReset,
  onResetSettings,
}: Props) {
  const data = useTelemetry(runtime);
  return (
    <aside className="technical-panel" aria-labelledby="settings-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">INSPECTOR</span>
          <h2 id="settings-title">Параметры</h2>
        </div>
        <span className="panel-icon" aria-hidden="true">
          ⌘
        </span>
      </div>
      <div className="panel-settings">
        {groups.map((group) => (
          <section className="settings-group" key={group.section}>
            <h3>
              <span>{group.title}</span>
              <span>{group.number}</span>
            </h3>
            {numericSettings
              .filter((setting) => setting.section === group.section)
              .map((setting) => (
                <NumericControl
                  key={setting.key}
                  setting={setting}
                  value={settingValue(config, setting)}
                  onChange={(value) => onSetting(setting, value)}
                />
              ))}
          </section>
        ))}
        <section className="settings-group">
          <h3>
            <label htmlFor="weapon-selector">Оружие</label>
            <span>1 / 2</span>
          </h3>
          <select
            id="weapon-selector"
            value={data.weaponId}
            onChange={(event) => {
              const weaponId = event.target.value;
              if (isWeaponId(weaponId))
                runtime.enqueueCommand({
                  type: 'setWeapon',
                  cannonId: runtime.getState().cannon.id,
                  weaponId,
                });
            }}
          >
            {Object.values(weaponDefinitions).map((weapon) => (
              <option key={weapon.id} value={weapon.id}>
                {weapon.name}
              </option>
            ))}
          </select>
          {data.weaponPending && (
            <p className="settings-note" role="status">
              Смена оружия ожидает следующего тика.
            </p>
          )}
          <p className="settings-note">{data.projectileName} · параметры следующего выстрела</p>
          {weaponNumericSettings
            .filter((setting) => setting.section !== 'impact')
            .map((setting) => (
              <NumericControl
                key={`${data.weaponId}-${setting.section}-${setting.key}`}
                setting={setting}
                value={weaponSettingValue(config, data.weaponId, setting)}
                onChange={(value) => onWeaponSetting(data.weaponId, setting, value)}
              />
            ))}
          <div className="energy-readout">
            <span>
              Дульная энергия <small>½mv²</small>
            </span>
            <output>
              {formatNumber(data.muzzleEnergy)} <small>J</small>
            </output>
          </div>
        </section>
        <section className="settings-group">
          <h3>
            <span>Разрушение рельефа</span>
            <span>IMPACT</span>
          </h3>
          {weaponNumericSettings
            .filter((setting) => setting.section === 'impact')
            .map((setting) => (
              <NumericControl
                key={`${data.weaponId}-${setting.key}`}
                setting={setting}
                value={weaponSettingValue(config, data.weaponId, setting)}
                onChange={(value) => onWeaponSetting(data.weaponId, setting, value)}
              />
            ))}
          <p className="settings-note">Применяется при попадании снарядов этого оружия.</p>
        </section>
        <section className="settings-group debug-group">
          <h3>
            <span>Визуализация</span>
            <span>05</span>
          </h3>
          {debugLabels.map(({ key, label }) => (
            <label className="check-row" key={key}>
              <input
                type="checkbox"
                checked={debug[key]}
                onChange={(event) => onDebug(key, event.target.checked)}
              />
              <span>{label}</span>
            </label>
          ))}
        </section>
      </div>
      <div className="panel-actions">
        <div className="button-pair">
          <button className="pause-button" onClick={onPause}>
            {paused ? '▶ Продолжить' : 'Ⅱ Пауза'} <kbd>P</kbd>
          </button>
          <button disabled={!paused} onClick={onStep} title="Выполнить ровно один тик на паузе">
            Шаг +1
          </button>
        </div>
        <button className="reset-scene" onClick={onReset}>
          ↺ Сбросить сцену <kbd>R</kbd>
        </button>
        <button className="text-button" onClick={onResetSettings}>
          Сбросить настройки
        </button>
      </div>
    </aside>
  );
}
