---
name: 'Windows Controller Fleet'
description: 'Calm operations console for trusted LAN fleet monitoring and control.'
colors:
  primary: '#14745e'
  primary-bright: '#42c6a2'
  warning: '#c77a13'
  danger: '#c34d43'
  network: '#2f7291'
  canvas: '#f3f6f2'
  surface: '#fffefb'
  surface-raised: '#ffffff'
  surface-muted: '#edf2ee'
  ink: '#17231f'
  muted: '#5f7069'
  line: '#d8e0da'
  sidebar: '#102522'
typography:
  display:
    fontFamily: 'Bahnschrift, Arial Narrow, sans-serif'
    fontSize: 'clamp(36px, 5vw, 58px)'
    fontWeight: 650
    lineHeight: 0.98
    letterSpacing: '-0.045em'
  headline:
    fontFamily: 'Bahnschrift, Arial Narrow, sans-serif'
    fontSize: 'clamp(24px, 3vw, 34px)'
    fontWeight: 650
    lineHeight: 1.08
    letterSpacing: '-0.03em'
  title:
    fontFamily: 'Bahnschrift, Arial Narrow, sans-serif'
    fontSize: '18px'
    fontWeight: 650
    lineHeight: 1.1
  body:
    fontFamily: 'Aptos, Segoe UI Variable Text, sans-serif'
    fontSize: '14px'
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: 'Bahnschrift, Arial Narrow, sans-serif'
    fontSize: '12px'
    fontWeight: 650
    letterSpacing: '0.13em'
rounded:
  xs: '7px'
  sm: '10px'
  md: '14px'
  lg: '20px'
spacing:
  compact: '8px'
  control: '14px'
  card: '20px'
  panel: '22px'
  workspace: 'clamp(18.7px, 4vw, 49.3px)'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '#ffffff'
    typography: '{typography.label}'
    rounded: '{rounded.xs}'
    padding: '0 14px'
    height: '42px'
  button-secondary:
    backgroundColor: '{colors.surface-raised}'
    textColor: '{colors.ink}'
    typography: '{typography.label}'
    rounded: '{rounded.xs}'
    padding: '0 14px'
    height: '42px'
  text-field:
    backgroundColor: '{colors.surface-raised}'
    textColor: '{colors.ink}'
    rounded: '{rounded.xs}'
    padding: '0 12px'
    height: '42px'
  panel-card:
    backgroundColor: '{colors.surface-raised}'
    textColor: '{colors.ink}'
    rounded: '{rounded.md}'
    padding: '22px'
  status-pill:
    backgroundColor: '{colors.surface-muted}'
    textColor: '{colors.ink}'
    rounded: '999px'
    padding: '0 9px'
    height: '25px'
---

## Overview

**Creative North Star: Calm Operations Console.** This interface treats fleet management as quiet instrumentation: stable surfaces, focused status signals, and a dark command rail framing a light workspace. It makes operational state legible before it asks for action.

The visual system combines measured teal, amber, and red signals with restrained gradients, an ambient grid, and low-contrast elevation. Light and dark themes preserve semantic roles rather than creating two unrelated products.

**Key Characteristics:**
- Restrained, trustworthy, and data-forward.
- Dense enough for operations, never cramped.
- High-value states use color, iconography, and copy together.
- Responsive dashboards protect labels and metrics from overflow.

**The Operational Calm Rule.** Screens should read like dependable equipment, not a marketing dashboard. Favor hierarchy, spacing, and semantic state over decoration.

## Colors

### Primary

- **Grounded Teal:** Primary action, selected navigation, healthy state, focus, and active operational emphasis.
- **Signal Mint:** Teal highlight reserved for dark-space accents, active markers, and positive status detail.

### Secondary

- **Measured Amber:** Warning, power, and environment emphasis; it is a signal, not a second primary action color.
- **Network Blue:** Network and connection-specific data only.

### Tertiary

- **Incident Red:** Error, destructive action, temperature concern, and failed command state.

### Neutral

- **Warm Operational Canvas:** Quiet page ground with elevated and muted surface layers for grouping.
- **Dark Command Rail:** Near-black green sidebar that holds global navigation and session context.
- **Ink, Muted, and Line:** Three-step reading hierarchy for primary content, supporting metadata, and structure.

**The Single Accent Rule.** Teal owns action and healthy state. Amber, blue, and red explain their specific operational meaning; they do not compete for primary attention.

## Typography

**Display Font:** Bahnschrift with Arial Narrow fallback.
**Body Font:** Aptos with Segoe UI Variable Text fallback.
**Label Font:** Bahnschrift with tight operational labels and numeric emphasis.

**Character:** Bahnschrift gives headings, telemetry values, navigation, and labels a precise instrument-panel rhythm. Aptos keeps explanatory copy and tables calm at operational density.

### Hierarchy

- **Display:** Compressed, high-impact headings for authentication and major identity moments.
- **Headline:** Page and section headings that establish scan order without consuming workspace.
- **Title:** Panel, host, and integration titles.
- **Body:** Fourteen-pixel reading copy with a 1.55 line height for descriptions and supporting data.
- **Label:** Uppercase or compact interface labels with wide tracking; never use them for long prose.

**The Read-Then-Act Rule.** Headings and values establish state first. Buttons follow the evidence rather than dominating it.

## Layout

Desktop uses a sticky command rail beside a fluid workspace, with a translucent sticky top bar for route title, host selection, and global controls. Surfaces align to a compact eight-to-twenty-six-pixel rhythm, while panels use larger interior breathing room.

At 1180px, the rail narrows and hero metrics move beneath identity content. At 780px, navigation becomes a compact top rail, host cards become single-column, and metric grids collapse. At 440px, compact data groups move to one column. The host hero must retain a five, then two, then one-column metric progression without fixed-width children.

**The No-Overflow Rule.** Operational labels and values may truncate with ellipsis, but grids must shrink through `minmax(0, 1fr)` before they overflow their container.

## Elevation & Depth

Depth is hybrid: most information surfaces rely on tonal contrast, one-pixel borders, and muted fills; panels, toolbars, and focused containers gain soft ambient shadows. The largest shadow belongs to the authentication shell and modal-scale moments, not routine cards.

**The Lift-Only-When-Needed Rule.** A shadow signals grouping, hierarchy, or interaction. Do not use heavy elevation as default decoration.

## Shapes

The form language is softly technical: a seven, ten, fourteen, and twenty-pixel radius scale gives controls, cards, dialogs, and authentication shells progressively more room to breathe. Borders are usually one pixel and low contrast. Status indicators use full pills; ambient circles and sparse grid lines provide the only ornamental geometry.

**The Measured Roundness Rule.** Use radius to clarify containment and priority. Keep high-density data rows more compact than major cards and dialogs.

## Components

### Buttons

- **Character:** Compact, confident controls with a precise label face.
- **Primary:** Teal gradient action with a forty-two-pixel minimum height.
- **Secondary:** Raised neutral surface with a structural border.
- **Danger:** Red-tinted surface and red text; reserve it for destructive or failed-state actions.
- **Hover / Focus:** Lift one pixel on hover; keep a visible three-pixel focus outline with offset.

### Cards / Containers

- **Character:** Tonal, bordered containers before they are shadowed containers.
- **Panels:** Medium-radius raised surfaces with generous panel padding and small ambient shadow.
- **Metric Cards:** Large numeric value, compact tracked label, semantic icon, and one color-coded operational signal.
- **Hero Stats:** Neutral inset cards, equal-width desktop columns, then two and one columns at smaller widths.

### Inputs / Fields

- **Character:** Quiet raised fields with minimum forty-two-pixel height and compact rounded corners.
- **Focus:** High-visibility teal focus outline; never rely only on a subtle border change.
- **Error:** Pair incident red with explicit error copy in the alert region.

### Navigation

- **Character:** Dark command rail with compact icon-and-label rows.
- **Active State:** Teal-tinted gradient, restrained border, and a three-pixel left marker.
- **Mobile:** Convert the rail into a horizontal compact bar while retaining icon labels and active-state clarity.

### Status Pills

- **Character:** Small full-round markers for short operational states.
- **Use:** Pair color with readable status text; never communicate health through color alone.

### Dialogs and Toasts

- **Character:** Large-radius bounded workspaces with panel-level padding and clear action rows.
- **Use:** Dialogs collect high-consequence configuration; toasts confirm actions or surface errors without replacing inline validation.

**The State-Speaks Rule.** Each state combines semantic color, textual label, and shape or icon. No operational state depends on color alone.

## Do's and Don'ts

### Do:

- **Do** preserve semantic color roles in both Light and Dark modes.
- **Do** use Bahnschrift for labels, navigation, titles, and telemetry values; use Aptos for explanatory text.
- **Do** retain visible keyboard focus, reduced-motion handling, and responsive metric grids.
- **Do** reserve strongest contrast and elevation for active, critical, or high-consequence moments.

### Don't:

- **Don't** introduce neon gaming treatments, glossy chrome, or decorative animation that competes with fleet state.
- **Don't** use amber, blue, or red as general primary actions.
- **Don't** use fixed-width dashboard stats inside constrained grids.
- **Don't** remove explicit status copy when a color or icon is present.
