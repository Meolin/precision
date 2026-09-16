import { extend, useApplication, useTick } from '@pixi/react';
import { Container, type Ticker } from 'pixi.js';
import { useCallback, useEffect, useRef } from 'react';
import type { GameRuntime } from '../core/GameRuntime';
import type { DebugOptions } from './DebugOptions';
import { SceneRenderer } from './SceneRenderer';
import type { RtsController } from '../client/RtsController';
import type { ShaderSettings } from './ShaderSettings';

extend({ Container });

export function GameScene({
  runtime,
  controls,
  debug,
  shaders,
}: {
  runtime: GameRuntime;
  controls: RtsController;
  debug: DebugOptions;
  shaders: ShaderSettings;
}) {
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
      controls.sync();
      controls.camera.update(ticker.elapsedMS);
      renderer.current?.draw(
        runtime,
        controls,
        debug,
        shaders,
        app.screen.width,
        app.screen.height,
      );
    },
    [app, runtime, controls, debug, shaders],
  );
  useTick(frame);
  return <pixiContainer ref={root} />;
}
