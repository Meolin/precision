import { Application, type ApplicationRef } from '@pixi/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Application as PixiApplication } from 'pixi.js';
import type { GameRuntime } from '../core/GameRuntime';
import { useGameInput } from '../input/useGameInput';
import type { DebugOptions } from './DebugOptions';
import { GameScene } from './GameScene';
import type { RtsController } from '../client/RtsController';
import type { ShaderSettings } from './ShaderSettings';
import type { TerrainSmoothingSettings } from './TerrainSmoothingSettings';
import type { TerrainTextureSettings } from './TerrainTextureSettings';
import type { BuildingAnimationPreview } from '../buildings/BuildingAnimationPreview';

interface Props {
  runtime: GameRuntime;
  controls: RtsController;
  debug: DebugOptions;
  shaders: ShaderSettings;
  terrainSmoothing: TerrainSmoothingSettings;
  terrainTexture: TerrainTextureSettings;
  onToggleTerrainDebug: (key: 'collisionMask' | 'terrainChunks' | 'terrainDirtyRects') => void;
  onPause: () => void;
  onReset: () => void;
  buildingPreview?: BuildingAnimationPreview;
  allowFireHotkey?: boolean;
}

export function GameCanvas({
  runtime,
  controls,
  debug,
  shaders,
  terrainSmoothing,
  terrainTexture,
  onToggleTerrainDebug,
  onPause,
  onReset,
  buildingPreview,
  allowFireHotkey = true,
}: Props) {
  const surface = useRef<HTMLDivElement>(null);
  const application = useRef<ApplicationRef>(null);
  const [fps, setFps] = useState(0);
  const resize = useCallback((app: PixiApplication) => {
    const element = surface.current;
    if (element)
      app.renderer.resize(Math.max(1, element.clientWidth), Math.max(1, element.clientHeight));
  }, []);
  useGameInput(surface, runtime, controls, onPause, onReset, onToggleTerrainDebug, allowFireHotkey);
  useEffect(() => {
    if (!surface.current) return;
    const observer = new ResizeObserver(() => {
      const app = application.current?.getApplication();
      if (app?.renderer) resize(app);
    });
    observer.observe(surface.current);
    return () => observer.disconnect();
  }, [resize]);
  useEffect(() => {
    let frameCount = 0;
    let lastSample = performance.now();
    let animationFrame = 0;
    const measure = (now: number) => {
      frameCount += 1;
      const elapsed = now - lastSample;
      if (elapsed >= 500) {
        setFps(Math.round((frameCount * 1000) / elapsed));
        frameCount = 0;
        lastSample = now;
      }
      animationFrame = requestAnimationFrame(measure);
    };
    animationFrame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  return (
    <div
      className="game-surface"
      ref={surface}
      tabIndex={0}
      role="application"
      aria-label="Баллистический полигон"
      aria-describedby="game-controls"
    >
      <output className="fps-counter" aria-label={`Частота кадров: ${fps} FPS`}>
        {fps} FPS
      </output>
      <Application
        ref={application}
        onInit={resize}
        resizeTo={surface}
        background={0x131b1e}
        antialias
        autoDensity
        resolution={Math.min(window.devicePixelRatio || 1, 2)}
        preference="webgl"
      >
        <GameScene
          runtime={runtime}
          controls={controls}
          debug={debug}
          shaders={shaders}
          terrainSmoothing={terrainSmoothing}
          terrainTexture={terrainTexture}
          buildingPreview={buildingPreview}
        />
      </Application>
    </div>
  );
}
