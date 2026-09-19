# Shared layouts

## Application shell

- Source: `src/app/App.tsx`
- Description: a single-page desktop RTS shell with header, primary workspace, game column, right inspector, and footer. The main workspace is `minmax(0, 1fr) 316px`; it collapses responsively in `App.css`.
- Render tree:

```tsx
<div className="app-shell">
  <header className="app-header">BALLISTICS / LAB · STEP 7 · Локальный полигон</header>
  <main className="workspace">
    <div className="workspace-main">
      <div className="title-row">Баллистический полигон</div>
      <HUD />
      <section className="range-panel">
        <div className="range-toolbar" />
        <GameCanvas />
        <div className="range-bottom" />
        <SceneStatus />
      </section>
      <SelectionPanel />
      <FlightTelemetry />
      <div className="controls-bar" />
    </div>
    <TechnicalPanel />
  </main>
  <footer className="app-footer" />
</div>
```

There is no router or cross-page navigation. The requested Animation Sandbox is a new in-shell developer tab/view and should reuse the header/footer, panel border language, typography, native controls, and the single existing Pixi renderer.
