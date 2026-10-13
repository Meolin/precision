import { extend, useApplication, useTick } from '@pixi/react';
import { Container, type Ticker } from 'pixi.js';
import { useCallback, useLayoutEffect, useRef } from 'react';
import type { GameRuntime } from '../core/GameRuntime';
import type { DebugOptions } from './DebugOptions';
import { SceneRenderer } from './SceneRenderer';
import type { RtsController } from '../client/RtsController';
import type { ShaderSettings } from './ShaderSettings';
import type { TerrainSmoothingSettings } from './TerrainSmoothingSettings';
import type { TerrainTextureSettings } from './TerrainTextureSettings';
import type {
  BuildingAnimationPreview,
  BuildingAnimationAssetStatus,
} from '../buildings/BuildingAnimationPreview';

extend({ Container });

export function GameScene({
  runtime,
  controls,
  debug,
  shaders,
  terrainSmoothing,
  terrainTexture,
  buildingPreview,
  onBuildingAssets,
}: {
  runtime: GameRuntime;
  controls: RtsController;
  debug: DebugOptions;
  shaders: ShaderSettings;
  terrainSmoothing: TerrainSmoothingSettings;
  terrainTexture: TerrainTextureSettings;
  buildingPreview?: BuildingAnimationPreview;
  onBuildingAssets?: (status: BuildingAnimationAssetStatus) => void;
}) {
  const { app, isInitialised } = useApplication();
  const root = useRef<Container>(null);
  const renderer = useRef<SceneRenderer | null>(null);
  useLayoutEffect(() => {
    if (!isInitialised || !root.current || !app.renderer) return;
    const scene = new SceneRenderer(root.current, app.renderer, onBuildingAssets);
    const pixiRenderer = app.renderer;
    const postrender = {
      postrender: () => {
        if (pixiRenderer.renderingToScreen) scene.markRendered();
      },
    };
    pixiRenderer.runners.postrender.add(postrender);
    renderer.current = scene;
    return () => {
      renderer.current = null;
      try {
        // Release the scene in layout cleanup, before the reconciler destroys Application.
        const runner = pixiRenderer.runners?.postrender;
        if (app.renderer === pixiRenderer && runner?.items) runner.remove(postrender);
      } finally {
        scene.destroy();
      }
    };
  }, [app, isInitialised, onBuildingAssets]);

  const frame = useCallback(
    (ticker: Ticker) => {
      if (!isInitialised || !app.renderer || !renderer.current) return;
      runtime.advance(ticker.elapsedMS);
      controls.sync();
      controls.camera.update(ticker.elapsedMS);
      renderer.current?.draw(
        runtime,
        controls,
        debug,
        shaders,
        terrainSmoothing,
        terrainTexture,
        buildingPreview,
        app.screen.width,
        app.screen.height,
      );
    },
    [
      app,
      isInitialised,
      runtime,
      controls,
      debug,
      shaders,
      terrainSmoothing,
      terrainTexture,
      buildingPreview,
    ],
  );
  useTick(frame);
  return <pixiContainer ref={root} />;
}
