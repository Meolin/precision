import { useCallback, useState } from 'react';
import type { NumericSetting } from '../game/config/GameConfig';
import { withSetting } from '../game/config/defaultGameConfig';
import type { GameRuntime } from '../game/core/GameRuntime';
import type { WeaponId } from '../game/weapons/WeaponDefinition';
import { withWeaponSetting, type WeaponNumericSetting } from '../game/weapons/WeaponSettings';
import { defaultDebugOptions, type DebugOptions } from '../game/rendering/DebugOptions';
import { GameCanvas } from '../game/rendering/GameCanvas';
import { FlightTelemetry, HUD, SceneStatus } from '../ui/HUD/HUD';
import { TechnicalPanel } from '../ui/TechnicalPanel/TechnicalPanel';
import './App.css';

export function App({ runtime }: { runtime: GameRuntime }) {
  const [config, setConfig] = useState(() => runtime.getConfig());
  const [paused, setPaused] = useState(runtime.isPaused());
  const [debug, setDebug] = useState<DebugOptions>({ ...defaultDebugOptions });
  const togglePause = useCallback(() => {
    runtime.setPaused(!runtime.isPaused());
    setPaused(runtime.isPaused());
  }, [runtime]);
  const resetScene = useCallback(() => runtime.reset(), [runtime]);
  const updateSetting = (setting: NumericSetting, value: number) =>
    setConfig(runtime.updateConfig(withSetting(runtime.getConfig(), setting, value)));
  const updateWeaponSetting = (id: WeaponId, setting: WeaponNumericSetting, value: number) =>
    setConfig(runtime.updateConfig(withWeaponSetting(runtime.getConfig(), id, setting, value)));
  const updateDebug = (key: keyof DebugOptions, value: boolean) => {
    setDebug((current) => ({ ...current, [key]: value }));
    if (key === 'samples') runtime.recordCollisionSamples = value;
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="16" r="9" />
            <path d="M16 1v9m0 12v9M1 16h9m12 0h9" />
            <circle cx="16" cy="16" r="2" />
          </svg>
          <span>
            BALLISTICS<span className="brand-divider">/</span>
            <b>LAB</b>
          </span>
          <span className="version-badge">STEP 2</span>
        </div>
        <span className="header-note">
          <span className="status-dot" />
          Локальный полигон
        </span>
      </header>
      <main className="workspace">
        <div className="workspace-main">
          <div className="title-row">
            <div>
              <span className="eyebrow">2D PHYSICS SANDBOX</span>
              <h1>Баллистический полигон</h1>
              <p>Задайте угол. Сделайте выстрел. Исследуйте физику.</p>
            </div>
            <span className="coordinate-note">
              +x →<br />
              +y ↓
            </span>
          </div>
          <HUD runtime={runtime} />
          <section className="range-panel" aria-label="Игровая сцена">
            <div className="range-toolbar">
              <div className="range-title">
                <span className={`status-dot ${paused ? 'is-paused' : ''}`} />
                <span>{paused ? 'СИМУЛЯЦИЯ НА ПАУЗЕ' : 'ПОЛИГОН / 01'}</span>
              </div>
              <div className="range-actions">
                <span className="wind-label">
                  Ветер{' '}
                  {config.physics.windAcceleration === 0
                    ? '—'
                    : config.physics.windAcceleration > 0
                      ? '→'
                      : '←'}{' '}
                  <b>{Math.abs(config.physics.windAcceleration).toFixed(1)}</b> m/s²
                </span>
                <button
                  onClick={() => runtime.newTerrain()}
                  title="Сгенерировать рельеф со следующим seed"
                >
                  Новый рельеф ↗
                </button>
              </div>
            </div>
            <GameCanvas
              runtime={runtime}
              debug={debug}
              onPause={togglePause}
              onReset={resetScene}
            />
            <div className="range-bottom">
              <div className="scene-legend">
                <span>
                  <i className="legend-trajectory" />
                  Прогноз
                </span>
                <span>
                  <i className="legend-impact" />
                  Попадание
                </span>
              </div>
              <span>
                {config.world.widthMeters} × {config.world.heightMeters} m
                <span className="dot-separator">·</span>1 cell = {config.terrain.cellSizeMeters} m
              </span>
            </div>
            <SceneStatus runtime={runtime} />
          </section>
          <FlightTelemetry runtime={runtime} />
          <div className="controls-bar" id="game-controls">
            <span>
              <kbd>Мышь</kbd> прицел
            </span>
            <span>
              <kbd>ЛКМ</kbd>
              <kbd>Space</kbd> выстрел
            </span>
            <span>
              <kbd>A</kbd>
              <kbd>D</kbd> угол
            </span>
            <span>
              <kbd>1</kbd>
              <kbd>2</kbd> оружие
            </span>
            <span>
              <kbd>P</kbd> пауза
            </span>
            <span>
              <kbd>R</kbd> сброс
            </span>
          </div>
          <p className="behavior-note">
            {paused
              ? 'На паузе команды ждут следующего шага. «Шаг +1» выполняет один тик.'
              : 'Масса, радиус и начальная скорость задаются при выстреле. Физика мира применяется сразу.'}
          </p>
        </div>
        <TechnicalPanel
          runtime={runtime}
          config={config}
          debug={debug}
          paused={paused}
          onSetting={updateSetting}
          onWeaponSetting={updateWeaponSetting}
          onDebug={updateDebug}
          onPause={togglePause}
          onStep={() => runtime.step()}
          onReset={resetScene}
          onResetSettings={() => setConfig(runtime.resetSettings())}
        />
      </main>
      <footer className="app-footer">
        <span>DESTRUCTIBLE TERRAIN · FIXED TIMESTEP</span>
        <span>
          React UI <span>/</span> PixiJS renderer <span>/</span> TypeScript simulation
        </span>
      </footer>
    </div>
  );
}
