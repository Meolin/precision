import { Application, type ApplicationRef } from '@pixi/react';
import { useCallback, useEffect, useRef } from 'react';
import type { Application as PixiApplication } from 'pixi.js';
import type { GameRuntime } from '../core/GameRuntime';
import { useGameInput } from '../input/useGameInput';
import type { DebugOptions } from './DebugOptions';
import { GameScene } from './GameScene';

interface Props {
  runtime: GameRuntime;
  debug: DebugOptions;
  onPause: () => void;
  onReset: () => void;
}

export function GameCanvas({ runtime, debug, onPause, onReset }: Props) {
  const surface = useRef<HTMLDivElement>(null);
  const application = useRef<ApplicationRef>(null);
  const resize = useCallback((app: PixiApplication) => {
    const element = surface.current;
    if (element)
      app.renderer.resize(Math.max(1, element.clientWidth), Math.max(1, element.clientHeight));
  }, []);
  useGameInput(surface, runtime, onPause, onReset);
  useEffect(() => {
    if (!surface.current) return;
    const observer = new ResizeObserver(() => {
      const app = application.current?.getApplication();
      if (app?.renderer) resize(app);
    });
    observer.observe(surface.current);
    return () => observer.disconnect();
  }, [resize]);

  return (
    <div
      className="game-surface"
      ref={surface}
      tabIndex={0}
      role="application"
      aria-label="Баллистический полигон"
      aria-describedby="game-controls"
    >
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
        <GameScene runtime={runtime} debug={debug} />
      </Application>
    </div>
  );
}
