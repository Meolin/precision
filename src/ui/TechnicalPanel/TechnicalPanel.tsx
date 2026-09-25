import { useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  numericSettings,
  settingValue,
  type EditableSection,
  type DamagePopupVelocityCurve,
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
import type { RtsController } from '../../game/client/RtsController';
import { isInstallation } from '../../game/entities/InstallationState';
import type { ShaderSettings } from '../../game/rendering/ShaderSettings';
import { ShaderControls } from './ShaderControls';
import { cameraZoom } from '../../game/client/CameraController';
import { cameraFrame } from '../../game/config/worldLayout';
import {
  defaultTerrainSmoothingSettings,
  isTerrainSmoothingQuality,
  type TerrainSmoothingSettings,
} from '../../game/rendering/TerrainSmoothingSettings';
import {
  defaultTerrainTextureSettings,
  isTerrainTextureOrientation,
  type TerrainTextureSettings,
} from '../../game/rendering/TerrainTextureSettings';

interface Props {
  runtime: GameRuntime;
  controls: RtsController;
  config: GameConfig;
  debug: DebugOptions;
  shaders: ShaderSettings;
  onShaders: (settings: ShaderSettings) => void;
  terrainSmoothing: TerrainSmoothingSettings;
  onTerrainSmoothing: (settings: TerrainSmoothingSettings) => void;
  terrainTexture: TerrainTextureSettings;
  onTerrainTexture: (settings: TerrainTextureSettings) => void;
  paused: boolean;
  onSetting: (setting: NumericSetting, value: number) => void;
  onDamagePopupCurve: (curve: DamagePopupVelocityCurve) => void;
  onWeaponSetting: (id: WeaponId, setting: WeaponNumericSetting, value: number) => void;
  onRicochetEnabled: (id: WeaponId, enabled: boolean) => void;
  onExplosionToggle: (
    id: WeaponId,
    key: 'enabled' | 'terrainOcclusionEnabled',
    value: boolean,
  ) => void;
  onDebug: (key: keyof DebugOptions, value: boolean) => void;
  onPause: () => void;
  onStep: () => void;
  onReset: () => void;
  onResetSettings: () => void;
}

function CollapsibleSettingsGroup({
  title,
  meta,
  children,
  className,
  ariaLabel,
}: {
  title: string;
  meta: string;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <details
      className={className ? `settings-group ${className}` : 'settings-group'}
      aria-label={ariaLabel}
    >
      <summary>
        <span className="settings-group-title">{title}</span>
        <span className="settings-group-summary-meta">
          <span>{meta}</span>
          <span className="settings-group-chevron" aria-hidden="true">
            ⌄
          </span>
        </span>
      </summary>
      <div className="settings-group-content">{children}</div>
    </details>
  );
}

const curveEditor = { width: 248, height: 142, padding: 18 };
type CurveControl = keyof DamagePopupVelocityCurve;
const curvePresets: readonly { label: string; curve: DamagePopupVelocityCurve }[] = [
  {
    label: 'Плавно',
    curve: { control1: { x: 1 / 3, y: 1 }, control2: { x: 2 / 3, y: 2 / 3 } },
  },
  {
    label: 'Импульс',
    curve: { control1: { x: 0.22, y: 0.5 }, control2: { x: 0.65, y: 0.08 } },
  },
  {
    label: 'Инерция',
    curve: { control1: { x: 0.3, y: 1 }, control2: { x: 0.78, y: 0.95 } },
  },
];

function BezierCurveControl({
  curve,
  onChange,
}: {
  curve: DamagePopupVelocityCurve;
  onChange: (curve: DamagePopupVelocityCurve) => void;
}) {
  const { width, height, padding } = curveEditor;
  const graphWidth = width - padding * 2;
  const graphHeight = height - padding * 2;
  const toScreen = ({ x, y }: { x: number; y: number }) => ({
    x: padding + x * graphWidth,
    y: padding + (1 - y) * graphHeight,
  });
  const first = toScreen(curve.control1);
  const second = toScreen(curve.control2);
  const setPoint = (control: CurveControl, point: { x: number; y: number }) => {
    const y = Math.min(1, Math.max(0, point.y));
    const rawX = Math.min(1, Math.max(0, point.x));
    const x =
      control === 'control1' ? Math.min(rawX, curve.control2.x) : Math.max(rawX, curve.control1.x);
    onChange({ ...curve, [control]: { x, y } });
  };
  const updatePoint = (control: CurveControl, event: React.PointerEvent<SVGCircleElement>) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const bounds = svg.getBoundingClientRect();
    const viewX = ((event.clientX - bounds.left) / bounds.width) * width;
    const viewY = ((event.clientY - bounds.top) / bounds.height) * height;
    setPoint(control, {
      x: (viewX - padding) / graphWidth,
      y: 1 - (viewY - padding) / graphHeight,
    });
  };
  const movePoint = (control: CurveControl, event: React.PointerEvent<SVGCircleElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) updatePoint(control, event);
  };
  const releasePoint = (event: React.PointerEvent<SVGCircleElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const adjustPoint = (control: CurveControl, event: React.KeyboardEvent<SVGCircleElement>) => {
    const step = event.shiftKey ? 0.05 : 0.01;
    const point = curve[control];
    const offsets =
      event.key === 'ArrowLeft'
        ? { x: -step, y: 0 }
        : event.key === 'ArrowRight'
          ? { x: step, y: 0 }
          : event.key === 'ArrowDown'
            ? { x: 0, y: -step }
            : event.key === 'ArrowUp'
              ? { x: 0, y: step }
              : null;
    if (!offsets) return;
    event.preventDefault();
    setPoint(control, { x: point.x + offsets.x, y: point.y + offsets.y });
  };
  return (
    <div className="curve-editor">
      <div className="curve-editor-heading">
        <span>Кривая скорости</span>
        <span>ВРЕМЯ →</span>
      </div>
      <div className="curve-presets" aria-label="Пресеты кривой">
        {curvePresets.map((preset) => (
          <button key={preset.label} type="button" onClick={() => onChange(preset.curve)}>
            {preset.label}
          </button>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Кривая скорости таблички урона. Перетаскивайте две контрольные точки."
      >
        <path
          className="curve-grid"
          d={`M ${padding} ${padding} H ${width - padding} M ${padding} ${height / 2} H ${width - padding} M ${padding} ${height - padding} H ${width - padding}`}
        />
        <path
          className="curve-grid"
          d={`M ${padding} ${padding} V ${height - padding} M ${width / 2} ${padding} V ${height - padding} M ${width - padding} ${padding} V ${height - padding}`}
        />
        <path
          className="curve-guide"
          d={`M ${padding} ${padding} L ${first.x} ${first.y} M ${width - padding} ${height - padding} L ${second.x} ${second.y}`}
        />
        <path
          className="curve-line"
          d={`M ${padding} ${padding} C ${first.x} ${first.y}, ${second.x} ${second.y}, ${width - padding} ${height - padding}`}
        />
        {(
          [
            ['control1', first],
            ['control2', second],
          ] as const
        ).map(([control, point], index) => (
          <circle
            className="curve-handle"
            cx={point.x}
            cy={point.y}
            r="5"
            key={control}
            role="button"
            tabIndex={0}
            aria-label={`Контрольная точка ${index + 1}`}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              updatePoint(control, event);
            }}
            onPointerMove={(event) => movePoint(control, event)}
            onPointerUp={releasePoint}
            onKeyDown={(event) => adjustPoint(control, event)}
          />
        ))}
      </svg>
      <div className="curve-values" aria-label="Координаты контрольных точек">
        <span>
          P1 <b>{curve.control1.x.toFixed(2)}</b> / <b>{curve.control1.y.toFixed(2)}</b>
        </span>
        <span>
          P2 <b>{curve.control2.x.toFixed(2)}</b> / <b>{curve.control2.y.toFixed(2)}</b>
        </span>
      </div>
      <p className="settings-note">
        Перемещайте точки или используйте стрелки после фокуса; <kbd>Shift</kbd> меняет шаг на 0.05.
        Выше кривая — дольше сохраняется скорость.
      </p>
    </div>
  );
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
  const options = 'options' in setting ? setting.options : undefined;
  const showSlider = setting.section === 'damagePopup';
  if (options)
    return (
      <div className="select-row">
        <label htmlFor={id}>{setting.label}</label>
        <select id={id} value={value} onChange={(event) => onChange(Number(event.target.value))}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  return (
    <div className={showSlider ? 'numeric-control has-slider' : 'numeric-control'}>
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
      {showSlider && (
        <input
          className="value-slider"
          type="range"
          min={setting.min}
          max={setting.max}
          step={setting.step}
          value={value}
          onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
          aria-label={`${setting.label}: ${value}${setting.unit}`}
        />
      )}
    </div>
  );
}

const groups: { section: EditableSection; title: string; number: string }[] = [
  { section: 'terrain', title: 'Сетка карты', number: 'TERRAIN' },
  { section: 'damagePopup', title: 'Таблички урона', number: 'FX' },
  { section: 'simulation', title: 'Симуляция', number: '01' },
  { section: 'physics', title: 'Физика мира', number: '02' },
];
const debugLabels: { key: keyof DebugOptions; label: string }[] = [
  { key: 'terrainVisual', label: 'Визуальный рельеф' },
  { key: 'collisionMask', label: 'CPU collision mask' },
  { key: 'terrainChunks', label: 'Границы terrain chunks' },
  { key: 'terrainDirtyRects', label: 'Dirty rectangles' },
  { key: 'trajectory', label: 'Прогноз траектории' },
  { key: 'velocity', label: 'Вектор скорости' },
  { key: 'impact', label: 'Маркер попадания' },
  { key: 'grid', label: 'Сетка рельефа' },
  { key: 'samples', label: 'Точки проверки столкновений' },
  { key: 'penetration', label: 'Путь пробития' },
  { key: 'surfaceNormals', label: 'Нормали поверхности' },
  { key: 'entityHitboxes', label: 'Хитбоксы юнитов' },
  { key: 'explosionRadius', label: 'Радиусы последнего взрыва' },
  { key: 'explosionOcclusion', label: 'Укрытия от взрыва' },
];

export function TechnicalPanel({
  runtime,
  controls,
  config,
  debug,
  shaders,
  onShaders,
  terrainSmoothing,
  onTerrainSmoothing,
  terrainTexture,
  onTerrainTexture,
  paused,
  onSetting,
  onDamagePopupCurve,
  onWeaponSetting,
  onRicochetEnabled,
  onExplosionToggle,
  onDebug,
  onPause,
  onStep,
  onReset,
  onResetSettings,
}: Props) {
  const data = useTelemetry(runtime, controls);
  const zoom = useSyncExternalStore(controls.camera.subscribe, controls.camera.getZoom);
  const [inspectedUnitId, setInspectedUnitId] = useState(2);
  const inspectedUnit = data.units.find((unit) => unit.id === inspectedUnitId);
  const inspectedInstallation =
    inspectedUnit && isInstallation(inspectedUnit) ? inspectedUnit : null;
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
        <CollapsibleSettingsGroup title="Камера" meta={`${zoom.toFixed(2)}×`} ariaLabel="Камера">
          <div className="numeric-control has-slider">
            <div className="numeric-row">
              <label htmlFor="camera-zoom">Масштаб</label>
              <output htmlFor="camera-zoom">{zoom.toFixed(2)}×</output>
            </div>
            <input
              id="camera-zoom"
              className="value-slider"
              type="range"
              min={cameraZoom.min}
              max={cameraZoom.max}
              step={cameraZoom.step}
              value={zoom}
              onChange={(event) => controls.camera.setZoom(event.currentTarget.valueAsNumber)}
              aria-valuetext={`${zoom.toFixed(2)}×`}
            />
          </div>
          <p className="settings-note">
            Обзор: {(cameraFrame.widthMeters / zoom).toFixed(1)} ×{' '}
            {(cameraFrame.heightMeters / zoom).toFixed(1)} м. Одинаковый при любом разрешении
            экрана.
          </p>
          <p className="settings-note">
            Стрелки — перемещение. Зажмите среднюю кнопку мыши или Alt + ЛКМ, чтобы двигать карту.
            Колесо — зум к указателю.
          </p>
          <button
            className="camera-reset"
            onClick={() => controls.camera.setZoom(cameraZoom.default)}
          >
            Вернуть масштаб 1×
          </button>
        </CollapsibleSettingsGroup>
        <CollapsibleSettingsGroup
          title="Шейдеры и эффекты"
          meta="12 FX"
          ariaLabel="Шейдеры и эффекты"
        >
          <ShaderControls settings={shaders} onChange={onShaders} />
        </CollapsibleSettingsGroup>
        <CollapsibleSettingsGroup
          title="Сглаживание рельефа"
          meta={terrainSmoothing.enabled ? `AA ${terrainSmoothing.quality}` : 'ВЫКЛ'}
          ariaLabel="Сглаживание рельефа"
        >
          <label className="check-row">
            <input
              type="checkbox"
              checked={terrainSmoothing.enabled}
              onChange={(event) =>
                onTerrainSmoothing({ ...terrainSmoothing, enabled: event.target.checked })
              }
            />
            <span>Включить сглаживание</span>
          </label>
          <div className="select-row">
            <label htmlFor="terrain-smoothing-quality">Качество</label>
            <select
              id="terrain-smoothing-quality"
              value={terrainSmoothing.quality}
              disabled={!terrainSmoothing.enabled}
              onChange={(event) => {
                const quality = Number(event.target.value);
                if (isTerrainSmoothingQuality(quality))
                  onTerrainSmoothing({ ...terrainSmoothing, quality });
              }}
            >
              <option value={1}>Низкое · 1×1</option>
              <option value={2}>Среднее · 2×2</option>
              <option value={4}>Высокое · 4×4</option>
              <option value={8}>Очень высокое · 8×8</option>
              <option value={16}>Максимальное · 16×16</option>
            </select>
          </div>
          <p className="settings-note">
            Плавный контур восстанавливается из поля расстояний. Число выборок края на экранный
            пиксель: 1, 4, 16, 64 или 256. Высшие уровни сильнее нагружают GPU. Текстуры материалов
            и физическая сетка от этой настройки не зависят.
          </p>
          <button
            className="shader-reset"
            type="button"
            onClick={() => onTerrainSmoothing({ ...defaultTerrainSmoothingSettings })}
          >
            Сбросить настройки сглаживания
          </button>
        </CollapsibleSettingsGroup>
        <CollapsibleSettingsGroup title="Текстуры рельефа" meta="ROCK" ariaLabel="Текстуры рельефа">
          <div className="select-row">
            <label htmlFor="terrain-texture-orientation">Ориентация</label>
            <select
              id="terrain-texture-orientation"
              value={terrainTexture.orientation}
              onChange={(event) => {
                const orientation = event.target.value;
                if (isTerrainTextureOrientation(orientation))
                  onTerrainTexture({ ...terrainTexture, orientation });
              }}
            >
              <option value="mirrored">Зеркально</option>
              <option value="sequential">Подряд</option>
              <option value="mirror-x">Зеркально по одной оси</option>
              <option value="random">Рандом</option>
            </select>
          </div>
          <p className="settings-note">
            Меняет раскладку текстуры Rock. Рандомная ориентация стабильна для каждой плитки.
          </p>
          <button
            className="shader-reset"
            type="button"
            onClick={() => onTerrainTexture({ ...defaultTerrainTextureSettings })}
          >
            Сбросить настройки текстур
          </button>
        </CollapsibleSettingsGroup>
        <CollapsibleSettingsGroup title="Сущности" meta="ENTITIES" ariaLabel="Сущности">
          <select
            id="unit-inspector"
            aria-label="Выбор сущности"
            value={inspectedUnitId}
            onChange={(event) => setInspectedUnitId(Number(event.target.value))}
          >
            {data.units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                Installation #{unit.id} ·{' '}
                {unit.ownerPlayerId === controls.playerId ? 'Своя' : 'Противник'}
              </option>
            ))}
          </select>
          <dl className="inspector-values">
            <div>
              <dt>Активные юниты</dt>
              <dd>{data.activeUnits}</dd>
            </div>
            <div>
              <dt>Команда</dt>
              <dd>{inspectedUnit?.teamId ?? '—'}</dd>
            </div>
            <div>
              <dt>Здоровье</dt>
              <dd>
                {formatNumber(inspectedUnit?.health.current ?? null, 1)} /{' '}
                {inspectedUnit?.health.max ?? '—'}
              </dd>
            </div>
            <div>
              <dt>Жив</dt>
              <dd>{inspectedUnit?.alive ? 'Да' : 'Нет'}</dd>
            </div>
            <div>
              <dt>Хитбокс</dt>
              <dd>Circle</dd>
            </div>
            <div>
              <dt>Радиус</dt>
              <dd>{formatNumber(inspectedUnit?.hitbox.radiusMeters ?? null, 2)} m</dd>
            </div>
          </dl>
          <h3>
            <span>Установка</span>
            <span>STATIONARY</span>
          </h3>
          <dl className="inspector-values">
            <div>
              <dt>Позиция X / Y</dt>
              <dd>
                {formatNumber(inspectedUnit?.position.x ?? null, 2)} /{' '}
                {formatNumber(inspectedUnit?.position.y ?? null, 2)} m
              </dd>
            </div>
            <div>
              <dt>Владелец</dt>
              <dd>Player {inspectedUnit?.ownerPlayerId ?? '—'}</dd>
            </div>
            <div>
              <dt>Тип</dt>
              <dd>
                {inspectedInstallation
                  ? weaponDefinitions[inspectedInstallation.installationType].name
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>На земле</dt>
              <dd>{inspectedInstallation?.grounding.grounded ? 'Да' : 'Нет'}</dd>
            </div>
            <div>
              <dt>Приказы</dt>
              <dd>
                {inspectedInstallation?.orders.length ?? 0} / {config.rts.maxOrders}
              </dd>
            </div>
            <div>
              <dt>Огонь</dt>
              <dd>
                {inspectedInstallation?.fireControl.lastFailure === 'noBallisticSolution'
                  ? 'NO BALLISTIC SOLUTION'
                  : (inspectedInstallation?.fireControl.status ?? '—')}
              </dd>
            </div>
          </dl>
          <p className="settings-note">
            Установки неподвижны. ПКМ по противнику — атака; A + ЛКМ — огонь по точке.
          </p>
        </CollapsibleSettingsGroup>
        <CollapsibleSettingsGroup
          title="Попадание в юнит"
          meta="ENTITY IMPACT"
          ariaLabel="Последнее попадание в юнит"
        >
          <p className="settings-note">
            {data.entityImpactWeapon
              ? `${data.entityImpactWeapon} / ${data.entityImpactProjectile}`
              : 'Попадите в цель справа, чтобы увидеть урон.'}
          </p>
          <dl className="inspector-values">
            <div>
              <dt>Цель</dt>
              <dd>{data.entityImpact ? `Unit #${data.entityImpact.targetEntityId}` : '—'}</dd>
            </div>
            <div>
              <dt>Источник</dt>
              <dd>{data.entityImpact ? `Unit #${data.entityImpact.ownerEntityId}` : '—'}</dd>
            </div>
            <div>
              <dt>Энергия удара</dt>
              <dd>{formatNumber(data.entityImpact?.kineticEnergyJ ?? null)} J</dd>
            </div>
            <div>
              <dt>Урон</dt>
              <dd>{formatNumber(data.entityImpact?.damage ?? null, 1)}</dd>
            </div>
            <div>
              <dt>HP до</dt>
              <dd>{formatNumber(data.entityImpact?.healthBefore ?? null, 1)}</dd>
            </div>
            <div>
              <dt>HP после</dt>
              <dd>{formatNumber(data.entityImpact?.healthAfter ?? null, 1)}</dd>
            </div>
            <div>
              <dt>Результат</dt>
              <dd>{data.entityImpact?.result ?? '—'}</dd>
            </div>
          </dl>
          <p className="settings-note">
            Прямое попадание · урон = энергия × 0.01, с пределом для каждого оружия.
          </p>
        </CollapsibleSettingsGroup>
        {groups.map((group) => (
          <CollapsibleSettingsGroup key={group.section} title={group.title} meta={group.number}>
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
            {group.section === 'terrain' && (
              <p className="settings-note">
                Размер физической ячейки рельефа. Изменение создаёт карту заново с текущим seed и
                сбрасывает сцену. Чем меньше ячейка, тем подробнее рельеф и выше нагрузка.
              </p>
            )}
            {group.section === 'damagePopup' && (
              <>
                <BezierCurveControl
                  curve={config.damagePopup.velocityCurve}
                  onChange={onDamagePopupCurve}
                />
                <p className="settings-note">
                  Скорость ×1 — скорость снаряда при попадании; ×0 — без движения. Размер ×1 —
                  исходный размер карточки, дополнительно растущий от силы удара до ×2. Дистанция
                  задана до учёта мощности удара, которая увеличивает её до ×3. Настройки
                  применяются к новым попаданиям. Время ×1 рассчитывается из скорости, дистанции и
                  кривой; большее значение замедляет анимацию. Подъём действует на протяжении всей
                  анимации, включая остановку и исчезновение.
                </p>
              </>
            )}
          </CollapsibleSettingsGroup>
        ))}
        <CollapsibleSettingsGroup title="Оружие" meta="Q / W / E">
          <select
            id="weapon-selector"
            aria-label="Выбор оружия"
            value={data.selectionWeaponId ?? ''}
            disabled={!data.selectedInstallations.length}
            onChange={(event) => {
              const weaponId = event.target.value;
              if (isWeaponId(weaponId)) controls.setWeapon(weaponId);
            }}
          >
            <option value="" disabled>
              {data.mixedWeapons ? 'Mixed' : 'Нет выделения'}
            </option>
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
          <p className="settings-note">
            Настройки профиля {data.weaponName} / {data.projectileName}. Применяются ко всем
            установкам с этим оружием.
          </p>
          {weaponNumericSettings
            .filter((setting) => setting.section === 'weapon' || setting.section === 'projectile')
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
        </CollapsibleSettingsGroup>
        <CollapsibleSettingsGroup title="Взрыв" meta="EXPLOSION" ariaLabel="Параметры взрыва">
          <label className="check-row">
            <input
              type="checkbox"
              checked={data.explosionEnabled}
              onChange={(event) =>
                onExplosionToggle(data.weaponId, 'enabled', event.target.checked)
              }
            />
            <span>Включить взрыв</span>
          </label>
          {weaponNumericSettings
            .filter((setting) => setting.section === 'explosion')
            .map((setting) => (
              <NumericControl
                key={`${data.weaponId}-explosion-${setting.key}`}
                setting={setting}
                value={weaponSettingValue(config, data.weaponId, setting)}
                onChange={(value) => onWeaponSetting(data.weaponId, setting, value)}
              />
            ))}
          <label className="check-row">
            <input
              type="checkbox"
              checked={data.explosionSettings.terrainOcclusionEnabled}
              onChange={(event) =>
                onExplosionToggle(data.weaponId, 'terrainOcclusionEnabled', event.target.checked)
              }
            />
            <span>Рельеф ослабляет урон взрыва</span>
          </label>
          <p className="settings-note">
            Применяется к следующим попаданиям этого оружия, включая снаряды в полёте. Прямой урон и
            урон взрыва складываются. Взрыв может повредить своё орудие.
          </p>
          <p className="settings-note">
            Взрыв срабатывает при первом контакте. Внутренний радиус ограничен внешним, минимальный
            урон — максимальным.
          </p>
        </CollapsibleSettingsGroup>
        <CollapsibleSettingsGroup
          title="Последний взрыв"
          meta="LAST EXPLOSION"
          ariaLabel="Последний взрыв"
        >
          {data.lastExplosion ? (
            <>
              <dl className="inspector-values">
                <div>
                  <dt>Позиция X / Y</dt>
                  <dd>
                    {formatNumber(data.lastExplosion.resolution.explosion.position.x, 2)} /{' '}
                    {formatNumber(data.lastExplosion.resolution.explosion.position.y, 2)} m
                  </dd>
                </div>
                <div>
                  <dt>Радиус поражения</dt>
                  <dd>{formatNumber(data.lastExplosion.resolution.explosion.radiusMeters, 1)} m</dd>
                </div>
                <div>
                  <dt>Целей в радиусе</dt>
                  <dd>{data.lastExplosion.resolution.affectedEntities.length}</dd>
                </div>
                <div>
                  <dt>Получили урон</dt>
                  <dd>{data.lastExplosion.entitiesDamaged}</dd>
                </div>
                <div>
                  <dt>За укрытием</dt>
                  <dd>
                    {
                      data.lastExplosion.resolution.affectedEntities.filter(
                        (target) => target.occluded,
                      ).length
                    }
                  </dd>
                </div>
                <div>
                  <dt>Максимальная потеря HP</dt>
                  <dd>{formatNumber(data.lastExplosion.maxDealt, 1)}</dd>
                </div>
                <div>
                  <dt>Радиус кратера</dt>
                  <dd>
                    {formatNumber(
                      data.lastExplosion.resolution.explosion.terrainDamageRadiusMeters,
                      1,
                    )}{' '}
                    m
                  </dd>
                </div>
                <div>
                  <dt>Удалено ячеек</dt>
                  <dd>{data.lastExplosion.removedCells}</dd>
                </div>
              </dl>
              {data.lastExplosion.resolution.affectedEntities.map((target) => (
                <details key={target.entityId}>
                  <summary>
                    Unit #{target.entityId} · {formatNumber(target.finalDamage, 1)} HP
                    {target.occluded ? ' · укрытие' : ''}
                  </summary>
                  <dl className="inspector-values">
                    <div>
                      <dt>До хитбокса</dt>
                      <dd>{formatNumber(target.distanceMeters, 2)} m</dd>
                    </div>
                    <div>
                      <dt>Урон до укрытия</dt>
                      <dd>{formatNumber(target.rawDamage, 1)} HP</dd>
                    </div>
                    <div>
                      <dt>Укрытие</dt>
                      <dd>{target.occluded ? 'Да' : 'Нет'}</dd>
                    </div>
                    <div>
                      <dt>Итоговый урон</dt>
                      <dd>{formatNumber(target.finalDamage, 1)} HP</dd>
                    </div>
                  </dl>
                </details>
              ))}
            </>
          ) : (
            <p className="settings-note">
              Взрывов ещё не было. Выберите Mortar и сделайте выстрел.
            </p>
          )}
          <p className="settings-note">
            Линии: зелёная — открытый путь, розовая — укрытие. Круги: оранжевый — зона поражения,
            светло-зелёный — полный урон, серый — кратер. Показаны позиции в момент взрыва.
          </p>
        </CollapsibleSettingsGroup>
        <CollapsibleSettingsGroup title="Разрушение рельефа" meta="IMPACT">
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
          <p className="settings-note">
            {data.explosionEnabled
              ? 'Взрыв включён: радиус кратера задаётся в секции «Взрыв».'
              : 'Применяется при попадании снарядов этого оружия.'}
          </p>
        </CollapsibleSettingsGroup>
        <CollapsibleSettingsGroup title="Пробитие" meta="PENETRATION">
          <dl className="inspector-values">
            <div>
              <dt>Включено</dt>
              <dd>{data.penetration?.enabled ? 'Да' : 'Нет'}</dd>
            </div>
            <div>
              <dt>Мощность пробития</dt>
              <dd>{formatNumber(data.penetration?.penetrationPower ?? null, 1)} ×</dd>
            </div>
            <div>
              <dt>Максимальная глубина</dt>
              <dd>{formatNumber(data.penetration?.maxPenetrationDistanceMeters ?? null, 1)} m</dd>
            </div>
            <div>
              <dt>Радиус канала</dt>
              <dd>{formatNumber(data.channelRadius, 2)} m</dd>
            </div>
            <div>
              <dt>Порог энергии выхода</dt>
              <dd>{formatNumber(data.penetration?.minimumExitEnergyJ ?? null)} J</dd>
            </div>
          </dl>
          <p className="settings-note">
            Профиль {data.weaponName}. Прогноз заканчивается перед пробитием или вторым контактом.
          </p>
          <p className="settings-note">
            Минимальный радиус канала учитывает размер снаряда и ячейки.
          </p>
        </CollapsibleSettingsGroup>
        <CollapsibleSettingsGroup title="Рикошет" meta="RICOCHET" ariaLabel="Параметры рикошета">
          <label className="check-row">
            <input
              type="checkbox"
              checked={data.ricochet.enabled}
              onChange={(event) => onRicochetEnabled(data.weaponId, event.target.checked)}
            />
            <span>Разрешить рикошет</span>
          </label>
          {weaponNumericSettings
            .filter((setting) => setting.section === 'ricochet')
            .map((setting) => (
              <NumericControl
                key={`${data.weaponId}-${setting.key}`}
                setting={setting}
                value={weaponSettingValue(config, data.weaponId, setting)}
                onChange={(value) => onWeaponSetting(data.weaponId, setting, value)}
              />
            ))}
          <p className="settings-note">
            0° — лобовое попадание, 90° — касательное. Rock допускает рикошет, Soil — нет.
          </p>
          <p className="settings-note">
            Настройки применяются к следующему выстрелу. Прогноз показывает один рикошет голубой
            точкой.
          </p>
        </CollapsibleSettingsGroup>
        <CollapsibleSettingsGroup
          title="Материал под курсором"
          meta="MATERIAL"
          ariaLabel="Материал под курсором"
        >
          <dl className="inspector-values">
            <div>
              <dt>Материал</dt>
              <dd>{data.cursorMaterial?.name ?? '—'}</dd>
            </div>
            <div>
              <dt>Сопротивление пробитию</dt>
              <dd>{formatNumber(data.cursorMaterial?.penetrationResistance ?? null)} J/m</dd>
            </div>
            <div>
              <dt>Blast resistance</dt>
              <dd>{formatNumber(data.cursorMaterial?.blastResistance ?? null, 1)}</dd>
            </div>
            <div>
              <dt>Твёрдость</dt>
              <dd>{formatNumber(data.cursorMaterial?.hardness ?? null, 1)}</dd>
            </div>
            <div>
              <dt>Коэффициент рикошета</dt>
              <dd>{formatNumber(data.cursorMaterial?.ricochetFactor ?? null, 2)}</dd>
            </div>
          </dl>
          <p className="settings-note">
            {data.cursor
              ? `x: ${formatNumber(data.cursor.x, 2)} m · y: ${formatNumber(data.cursor.y, 2)} m`
              : 'Наведите курсор на полигон: Soil — грунт, Rock — скала.'}
          </p>
          <p className="settings-note">Blast resistance пока справочная величина.</p>
        </CollapsibleSettingsGroup>
        <CollapsibleSettingsGroup title="Визуализация" meta="05" className="debug-group">
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
          <p className="settings-note">
            Путь записывается при включённой опции: вход — оранжевый, выход — зелёный, остановка —
            розовая.
          </p>
        </CollapsibleSettingsGroup>
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
