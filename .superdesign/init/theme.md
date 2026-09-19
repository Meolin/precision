# Theme

## Compact token summary

- Fonts: Manrope / Segoe UI for UI; IBM Plex Mono / Consolas for data, labels, badges, and controls.
- Background: `#101517`; panel `#181f21`; raised game panel `#151e20`; inset `#121a1b`.
- Text: `#dce3df`; muted `#95a39e`; dim `#768782`.
- Border: `#2a3436`, stronger `#33413f` / `#354143`.
- Primary accent: acid lime `#d5ec84`; secondary cyan `#85d7e8`; warning orange `#f5af73`; debug pink `#ed85ac`.
- Radius: 3px micro controls, 5px buttons, 8px panels.
- Motion: 150ms background/border hover transitions; editor playback is progress-driven and must not own production timing.
- Layout: max width 1720px, 34px outer padding, 28px workspace gap, 316px inspector, dense 8–12px control text.
- Shadows: mostly avoided; status dots use a subtle accent halo.
- Color scheme: dark only.

## Raw token source

```css
:root {
  font-family: 'Manrope', 'Segoe UI', sans-serif;
  color: #dce3df;
  background: #101517;
  --text: #dce3df;
  --muted: #95a39e;
  --dim: #768782;
  --panel: #181f21;
  --border: #2a3436;
  --accent: #d5ec84;
  --mono: 'IBM Plex Mono', Consolas, monospace;
  color-scheme: dark;
}
button {
  padding: 8px 12px;
  color: var(--text);
  background: #222c2e;
  border: 1px solid #354143;
  border-radius: 5px;
}
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
```

Full raw theme and responsive rules: `src/app/App.css` (672 lines) and `src/ui/TechnicalPanel/TechnicalPanel.css` (415 lines).
