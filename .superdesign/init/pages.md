# Page dependency trees

## `/` — Ballistics Lab

Entry: `src/main.tsx`

Dependencies:

- `src/app/App.tsx`
  - `src/app/App.css`
  - `src/game/core/GameRuntime.ts`
  - `src/game/client/RtsController.ts`
  - `src/game/rendering/GameCanvas.tsx`
    - `src/game/rendering/GameScene.tsx`
      - `src/game/rendering/SceneRenderer.ts`
    - `src/game/input/useGameInput.ts`
  - `src/ui/HUD/HUD.tsx`
  - `src/ui/SelectionPanel/SelectionPanel.tsx`
    - `src/ui/SelectionPanel/SelectionPanel.css`
  - `src/ui/TechnicalPanel/TechnicalPanel.tsx`
    - `src/ui/TechnicalPanel/TechnicalPanel.css`
    - `src/ui/TechnicalPanel/ShaderControls.tsx`
  - `src/game/rendering/DebugOptions.ts`
  - `src/game/rendering/ShaderSettings.ts`
  - `src/game/rendering/TerrainSmoothingSettings.ts`

The Animation Sandbox should reuse `App.tsx` as shell anchor, `TechnicalPanel` as dense-inspector anchor, and `GameCanvas`/`SceneRenderer` as the only production Pixi path.
