# Extractable components

There are no logo-bearing image assets or third-party UI primitives. The header mark is inline SVG in `App.tsx`.

## AppHeader

- Source: `src/app/App.tsx`
- Category: layout
- Description: BALLISTICS/LAB brand row with version badge and local-range status.
- Extractable props: activeView (string), versionLabel (string).
- Hardcoded: crosshair SVG, brand label, status-dot treatment.

## TechnicalPanelShell

- Source: `src/ui/TechnicalPanel/TechnicalPanel.tsx`
- Category: layout
- Description: narrow right-hand inspector with grouped controls and sticky actions.
- Extractable props: title (string), activeGroup (string).
- Hardcoded: inspector eyebrow, borders, density, mono metadata labels.

## SettingsGroup

- Source: `src/ui/TechnicalPanel/TechnicalPanel.tsx`
- Category: basic
- Description: collapsible settings group with title, meta number, chevron, and content.
- Extractable props: title (string), meta (string), open (boolean).
- Hardcoded: disclosure styling and spacing.

## GameRangePanel

- Source: `src/app/App.tsx`
- Category: layout
- Description: bordered scene frame with toolbar, Pixi surface, legend, and status strip.
- Extractable props: paused (boolean), title (string).
- Hardcoded: panel geometry, status dot, scene legend structure.
