# Ballistics Lab design system

## Product context

Ballistics Lab is a local developer-focused 2D RTS artillery sandbox. React owns UI and serializable commands; deterministic TypeScript owns simulation; PixiJS owns rendering. The Animation Sandbox is an expert tool inside the existing application, not a separate branded product.

## Visual language

Use the existing dark technical-instrument aesthetic: `#101517` background, `#181f21` panels, `#121a1b` inset regions, `#2a3436` borders, `#dce3df` text, `#95a39e` muted text, acid-lime `#d5ec84` action accent, cyan `#85d7e8` animation/materialization accent, orange `#f5af73` warnings. No gradients, glassmorphism, marketing cards, oversized type, decorative illustrations, or rounded consumer-app styling.

Use Manrope/Segoe UI for readable labels and IBM Plex Mono/Consolas for values, IDs, milestones, progress, badges, and technical metadata. Typography is dense: 8–12px metadata and controls, 16–24px section titles. Radii are 3–8px. Dividers do most of the hierarchy work.

## Sandbox layout

Keep the existing app header/footer. Add an obvious top-level Game / Animation Sandbox view switch. The sandbox itself is a desktop workbench:

- Left rail: Stages, PNG import dropzone, thumbnail stack, drag/reorder affordance, stage name, stable assetId, milestone.
- Center: large checker/grid preview using the production Pixi renderer, origin crosshair, canvas bounds, onion-skin toggle, zoom/readout only as UI state.
- Right inspector: selected stage alignment (x/y/scale), adjacent transition selector, dissolve direction/noise/direction strength/edge width/intensity/color/easing.
- Bottom: full-width timeline with milestone ticks, scrubber, progress value, play/pause, loop, speed, then game-test and JSON actions.

Controls should prioritize precision and scannability. Pair sliders with numeric inputs. Keep primary actions distinct: acid-lime for playback/apply, cyan for Test in Game, neutral for import/export, destructive muted orange for remove.

## Interaction and motion

Preview animation is derived only from global progress 0..1. Scrubbing is immediate. Playback advances progress but does not alter the production player contract. Respect visible focus styles and label every compact control. Use lightweight 150ms UI transitions only; crossfade/reveal/dissolve visualization is performed by the runtime renderer.

## Production constraints reflected in UI

Expose schemaVersion, config id, canvas, origin, stages, transitions, empty vfx and sounds extension points. Make local-object-URL status visually separate from exportable assetId. Validation errors must appear near affected rows and block export. Test In Game should clearly indicate that it uses the real scene, terrain, camera, and renderer.
