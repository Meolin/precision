import { useCallback, useState } from 'react';
import type { NumericSetting } from '../game/config/GameConfig';
import { withDamagePopupCurve, withSetting } from '../game/config/defaultGameConfig';
import type { GameRuntime } from '../game/core/GameRuntime';
import type { WeaponId } from '../game/weapons/WeaponDefinition';
import {
  withWeaponSetting,
  withRicochetEnabled,
  withExplosionToggle,
  type WeaponNumericSetting,
} from '../game/weapons/WeaponSettings';
import { defaultDebugOptions, type DebugOptions } from '../game/rendering/DebugOptions';
import { GameCanvas } from '../game/rendering/GameCanvas';
import { FlightTelemetry, HUD, SceneStatus } from '../ui/HUD/HUD';
import { TechnicalPanel } from '../ui/TechnicalPanel/TechnicalPanel';
import './App.css';
import { RtsController } from '../game/client/RtsController';
import { SelectionPanel } from '../ui/SelectionPanel/SelectionPanel';
import { createShaderSettings } from '../game/rendering/ShaderSettings';
import { defaultTerrainSmoothingSettings } from '../game/rendering/TerrainSmoothingSettings';
import { defaultTerrainTextureSettings } from '../game/rendering/TerrainTextureSettings';
import { AnimationSandbox } from '../ui/AnimationSandbox/AnimationSandbox';
import { createDefaultBuildingAnimationConfig } from '../game/buildings/BuildingAnimationConfig';
import type { BuildingAnimationPreview } from '../game/buildings/BuildingAnimationPreview';

export function App({ runtime }: { runtime: GameRuntime }) {
  const [activeView, setActiveView] = useState<'game' | 'animation'>('game');
  const [controls] = useState(() => new RtsController(runtime));
  const [config, setConfig] = useState(() => runtime.getConfig());
  const [paused, setPaused] = useState(runtime.isPaused());
  const [debug, setDebug] = useState<DebugOptions>({ ...defaultDebugOptions });
  const [shaders, setShaders] = useState(createShaderSettings);
  const [terrainSmoothing, setTerrainSmoothing] = useState(() => ({
    ...defaultTerrainSmoothingSettings,
  }));
  const [terrainTexture, setTerrainTexture] = useState(() => ({
    ...defaultTerrainTextureSettings,
  }));
  const [buildingPreview, setBuildingPreview] = useState<BuildingAnimationPreview>(() => ({
    config: createDefaultBuildingAnimationConfig(),
    progress: 0,
    visible: false,
    onionSkinStageIndex: null,
    sourceUrls: {},
    sourceRevision: 0,
    position: null,
    opacity: 1,
    showHitbox: true,
  }));
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
    if (key === 'penetration') {
      runtime.recordPenetrationPaths = value;
      if (!value) runtime.penetrationPath = null;
    }
  };
  const toggleTerrainDebug = useCallback(
    (key: 'collisionMask' | 'terrainChunks' | 'terrainDirtyRects') =>
      setDebug((current) => ({ ...current, [key]: !current[key] })),
    [],
  );

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
          <span className="version-badge">STEP 7</span>
        </div>
        <div className="header-tools">
          <nav className="view-tabs" aria-label="Режим приложения">
            <button
              className={activeView === 'game' ? 'is-active' : ''}
              onClick={() => setActiveView('game')}
            >
              GAME
            </button>
            <button
              className={activeView === 'animation' ? 'is-active' : ''}
              onClick={() => setActiveView('animation')}
            >
              ANIMATION SANDBOX
            </button>
          </nav>
          <span className="header-note">
            <span className="status-dot" />
            Локальный полигон
          </span>
        </div>
      </header>
      {activeView === 'game' ? (
        <main className="workspace">
          <div className="workspace-main">
            <div className="title-row">
              <div>
                <span className="eyebrow">RTS ARTILLERY COMMAND</span>
                <h1>Баллистический полигон</h1>
                <p>Выделите батарею. Назначьте цели. Задайте очередь выстрелов.</p>
              </div>
              <span className="coordinate-note">
                +x →<br />
                +y ↓
              </span>
            </div>
            <HUD runtime={runtime} controls={controls} />
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
                shaders={shaders}
                terrainSmoothing={terrainSmoothing}
                terrainTexture={terrainTexture}
                runtime={runtime}
                controls={controls}
                debug={debug}
                onToggleTerrainDebug={toggleTerrainDebug}
                onPause={togglePause}
                onReset={resetScene}
                buildingPreview={buildingPreview}
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
                  <span>
                    <i className="legend-soil" />
                    Soil
                  </span>
                  <span>
                    <i className="legend-rock" />
                    Rock
                  </span>
                </div>
                <span>
                  {config.world.widthMeters} × {config.world.heightMeters} m
                  <span className="dot-separator">·</span>1 cell = {config.terrain.cellSizeMeters} m
                </span>
              </div>
              <SceneStatus runtime={runtime} />
            </section>
            <SelectionPanel runtime={runtime} controls={controls} />
            <FlightTelemetry runtime={runtime} />
            <div className="controls-bar" id="game-controls">
              <span>
                <kbd>ПКМ</kbd> атака противника
              </span>
              <span>
                <kbd>ЛКМ</kbd> выделение / рамка
              </span>
              <span>
                <kbd>Space</kbd> ручной выстрел
              </span>
              <span>
                <kbd>A</kbd>
                огонь по точке
              </span>
              <span>
                <kbd>Q / W / E</kbd> оружие
              </span>
              <span>
                <kbd>Ctrl + 1…9</kbd> сохранить группу
              </span>
              <span>
                <kbd>1…9</kbd> выбрать группу
              </span>
              <span>
                <kbd>Shift</kbd> очередь / добавить выделение
              </span>
              <span>
                <kbd>S</kbd> стоп <kbd>Esc</kbd> отмена
              </span>
              <span>
                <kbd>↑ ↓ ← →</kbd> камера
              </span>
              <span>
                <kbd>СКМ / Alt + ЛКМ</kbd> двигать карту
              </span>
              <span>
                <kbd>Колесо</kbd> зум
              </span>
              <span>
                <kbd>ЛКМ на миникарте</kbd> перейти / перетащить камеру
              </span>
              <span>
                <kbd>Мышь / Shift + ← →</kbd> ручной прицел
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
            shaders={shaders}
            onShaders={setShaders}
            terrainSmoothing={terrainSmoothing}
            onTerrainSmoothing={setTerrainSmoothing}
            terrainTexture={terrainTexture}
            onTerrainTexture={setTerrainTexture}
            runtime={runtime}
            controls={controls}
            config={config}
            debug={debug}
            paused={paused}
            onSetting={updateSetting}
            onDamagePopupCurve={(curve) =>
              setConfig(runtime.updateConfig(withDamagePopupCurve(runtime.getConfig(), curve)))
            }
            onWeaponSetting={updateWeaponSetting}
            onRicochetEnabled={(id, enabled) =>
              setConfig(runtime.updateConfig(withRicochetEnabled(runtime.getConfig(), id, enabled)))
            }
            onExplosionToggle={(id, key, value) =>
              setConfig(
                runtime.updateConfig(withExplosionToggle(runtime.getConfig(), id, key, value)),
              )
            }
            onDebug={updateDebug}
            onPause={togglePause}
            onStep={() => runtime.step()}
            onReset={resetScene}
            onResetSettings={() => {
              setConfig(runtime.resetSettings());
              setShaders(createShaderSettings());
              setTerrainSmoothing({ ...defaultTerrainSmoothingSettings });
              setTerrainTexture({ ...defaultTerrainTextureSettings });
              controls.camera.setZoom(1);
            }}
          />
        </main>
      ) : (
        <AnimationSandbox
          runtime={runtime}
          controls={controls}
          debug={debug}
          shaders={shaders}
          terrainSmoothing={terrainSmoothing}
          terrainTexture={terrainTexture}
          preview={buildingPreview}
          onPreview={setBuildingPreview}
          onOpenGame={() => setActiveView('game')}
          onToggleTerrainDebug={toggleTerrainDebug}
          onPause={togglePause}
          onReset={resetScene}
        />
      )}
      <footer className="app-footer">
        <span>DESTRUCTIBLE TERRAIN · FIXED TIMESTEP</span>
        <span>
          React UI <span>/</span> PixiJS renderer <span>/</span> TypeScript simulation
        </span>
      </footer>
    </div>
  );
}
