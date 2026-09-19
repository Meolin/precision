# Shared UI components

Ballistics Lab uses custom React components and native HTML controls; there is no third-party component library and no standalone `src/components/ui` primitive layer.

## GameCanvas

- Source: `src/game/rendering/GameCanvas.tsx`
- Purpose: reusable React host for the single Pixi game scene.
- Props: runtime, controls, debug, shaders, terrainSmoothing, pause/reset callbacks.

```tsx
import { useEffect, useRef, useState } from 'react';
import { Application } from 'pixi.js';
import type { RtsController } from '../client/RtsController';
import type { GameRuntime } from '../core/GameRuntime';
import type { DebugOptions } from './DebugOptions';
import { GameScene } from './GameScene';
import type { ShaderSettings } from './ShaderSettings';
import type { TerrainSmoothingSettings } from './TerrainSmoothingSettings';
import { useGameInput } from '../input/useGameInput';

interface Props {
  runtime: GameRuntime;
  controls: RtsController;
  debug: DebugOptions;
  shaders: ShaderSettings;
  terrainSmoothing: TerrainSmoothingSettings;
  onToggleTerrainDebug: (key: 'collisionMask' | 'terrainChunks' | 'terrainDirtyRects') => void;
  onPause: () => void;
  onReset: () => void;
}

export function GameCanvas(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [app, setApp] = useState<Application | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [fps, setFps] = useState(0);
  useGameInput(
    hostRef,
    props.runtime,
    props.controls,
    props.onPause,
    props.onReset,
    props.onToggleTerrainDebug,
  );
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: Math.floor(entry.contentRect.width),
        height: Math.floor(entry.contentRect.height),
      }),
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const application = new Application();
    let cancelled = false;
    void application
      .init({ backgroundAlpha: 0, antialias: true, resizeTo: hostRef.current ?? undefined })
      .then(() => {
        if (cancelled || !hostRef.current) return application.destroy(true);
        hostRef.current.prepend(application.canvas);
        setApp(application);
      });
    return () => {
      cancelled = true;
      setApp(null);
      application.destroy(true);
    };
  }, []);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      setFps(Math.round(props.runtime.fps));
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [props.runtime]);
  return (
    <div ref={hostRef} className="game-surface" tabIndex={0}>
      {app && size.width > 0 && size.height > 0 ? (
        <GameScene app={app} width={size.width} height={size.height} {...props} />
      ) : null}
      <output className="fps-counter" aria-label={`Частота кадров: ${fps} FPS`}>
        {fps} FPS
      </output>
    </div>
  );
}
```

## TechnicalPanel

- Source: `src/ui/TechnicalPanel/TechnicalPanel.tsx`
- Purpose: the shared dense inspector pattern used by developer controls.
- Key patterns: `.technical-panel`, `.panel-heading`, collapsible `.settings-group`, `.numeric-control`, `.value-slider`, `.check-row`, `.select-row`, sticky `.panel-actions`.
- Full source is 959 lines and is passed directly to design generation as the relevant render range `:348:959` under the payload-budget rule.
