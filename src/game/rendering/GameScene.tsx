import { extend, useApplication, useTick } from '@pixi/react';
import { Container, type Ticker } from 'pixi.js';
import { useCallback, useEffect, useRef } from 'react';
import type { GameRuntime } from '../core/GameRuntime';
import type { DebugOptions } from './DebugOptions';
import { SceneRenderer } from './SceneRenderer';

extend({ Container });

export function GameScene({ runtime, debug }: { runtime: GameRuntime; debug: DebugOptions }) {
  const { app } = useApplication();
  const root = useRef<Container>(null);
  const renderer = useRef<SceneRenderer | null>(null);
  useEffect(() => {
    if (!root.current) return;
    const scene = new SceneRenderer(root.current);
    renderer.current = scene;
    return () => {
      renderer.current = null;
      scene.destroy();
    };
  }, []);

  const frame = useCallback(
    (ticker: Ticker) => {
      runtime.advance(ticker.elapsedMS);
      renderer.current?.draw(runtime, debug, app.screen.width, app.screen.height);
    },
    [app, runtime, debug],
  );
  useTick(frame);
  return <pixiContainer ref={root} />;
}
