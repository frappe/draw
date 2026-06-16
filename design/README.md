# Handoff: Frappe Draw — Home dashboard + Block-diagram editor

## Overview
Frappe Draw is a diagram-creation app whose guiding objective is to make creating
diagrams **extremely easy** — one-click everything, beautiful-by-default shapes, a
bounded (not infinite) canvas, and a curated palette. This package covers the two
core surfaces designed in this round:

1. **Home dashboard** — diagram tiles, folders, trash, and the new-diagram popup.
2. **Editor** — top toolbar, left creation palette, bounded SVG canvas, and the
   right "modification palette" of one-click action tiles.

It also documents the v1 **signature/differentiation interactions**: selection +
rotation handles, **hover-arrows**, **smart alignment guides + snapping**,
**one-click theme presets**, and **format painter**.

This handoff is the **visual/interaction companion** to the written Product
Specification (v1). Where the PRD defines *what* the app does and the data model,
this README defines *exactly how it looks and behaves*. Defer to the PRD for backend,
DocTypes, persistence, sharing, export, and build order.

---

## About the design files
The files in this bundle are **design references created in HTML/SVG** — a prototype
showing the intended look and behavior. **They are not production code to copy
directly.**

The target environment (per the PRD §11) is a **Frappe app**: **Vue 3 +
[frappe-ui](https://github.com/frappe/frappe-ui) + Tailwind** SPA, with the canvas
rendered as **SVG DOM** (not `<canvas>`). The task is to **recreate these designs in
that stack** using frappe-ui components and the Espresso design tokens
(`bg-surface-white`, `text-ink-gray-9`, etc., which map 1:1 to the CSS variables
listed here) — not to ship the prototype HTML.

> The prototype was authored as a single streaming component. Treat the markup as a
> spec for structure and styling, not as a component architecture to mirror.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, and interaction states are
final and Espresso-accurate. Recreate the UI pixel-for-pixel using frappe-ui +
Espresso tokens. The only intentionally *staged* (non-functional) parts are real
drawing/dragging, zoom, and pan — those are described here but were not built
interactively.

---

## Canonical decisions from this review
- **Right palette = the GRID layout.** Two other explorations (List, Compact) exist
  in the prototype behind a review switcher (bottom-left "Prototype — review" panel).
  **Build the Grid layout only.** Ignore List/Compact and the review switcher — they
  are not part of the product.
- **Dark mode toggles chrome only** — the canvas paper and shapes stay light in both
  modes (PRD §4.4).
- **Brand accent = violet `#6846E3`** for the Frappe Draw logomark (each Frappe
  product picks one brand color; the chrome itself stays neutral gray).

---

## Design tokens

All tokens are defined in **`colors_and_type.css`** (copied from the Espresso design
system). Use the frappe-ui / Tailwind equivalents in the real app. Key values used by
these screens:

### Neutrals (the chrome is ~95% gray)
| Token | Hex | Use |
|---|---|---|
| `--es-white` | `#FFFFFF` | cards, sheets, canvas paper |
| `--es-gray-50` | `#F8F8F8` | page bg, sidebar bg, recessed areas |
| `--es-gray-100` | `#F3F3F3` | hover on white cells |
| `--es-gray-200` | `#EDEDED` | **hairline divider / card border** (workhorse) |
| `--es-gray-300` | `#E2E2E2` | stronger border, scrollbar thumb |
| `--es-gray-400` | `#C7C7C7` | dashed create-tile border |
| `--es-gray-500` | `#999999` | placeholder / muted icon |
| `--es-gray-600` | `#7C7C7C` | secondary text, connector stroke |
| `--es-gray-700` | `#525252` | secondary text |
| `--es-gray-800` | `#383838` | body text |
| `--es-gray-900` | `#171717` | primary text, solid button bg, active tile border |

Canvas pan-area background is a literal **`#EEEEF0`** (slightly cooler than the page
gray, so the white paper reads as a distinct object). Grid dots are **`#DCDCDF`**.

### Functional / accent
| Token | Hex | Use |
|---|---|---|
| `--es-blue-600` | `#006EDB` | **selection handles, hover-arrows, info** |
| `--es-green-600` | `#30A66D` | Saved indicator check |
| `--es-amber-*` | — | trash warning banner |
| `--es-red-600` | `#CC2929` | destructive (delete) |
| `--es-violet-500` | `#6846E3` | brand logomark, user avatar |
| smart-guide pink | `#E34AA6` | alignment guide lines + snap pill |

### Type — Inter (`--es-font-sans`), four weights: 500 / 600 / 700 / 800
| Role | Size / weight / line-height | Tracking |
|---|---|---|
| Page H1 ("All diagrams") | 22px / 700 / 1.1 | -0.01em |
| Section label (uppercase) | 10–11px / 600 | 0.04–0.05em |
| Tile title | 13px / 600 | — |
| Toolbar title | 14px / 600 | — |
| Body / nav item | 13px / 500 | — |
| Tile meta / hint | 11px / 500, color `ink-5` | — |
| Grid-tile micro-label | 9px / 500, color `ink-6` | 0.01em |
| Canvas shape title | 22px / 600 (in 1280×720 logical units) | — |
| Canvas shape subtitle | 16px / 500, opacity .72 | — |

### Spacing, radius, elevation
- **Radius:** tiles/buttons/inputs `--es-radius-2` (6px); cards/tiles
  `--es-radius-4` (12px); modal `--es-radius-5` (16px); badges/pills
  `--es-radius-8` (100px, full pill).
- **Elevation:** flat-with-borders by default (`--es-elev-base` = none). Floating
  surfaces only: bottom palette `--es-elev-xl`, popovers `--es-elev-xl`, modal
  `--es-elev-2xl`, review panel `--es-elev-lg`.
- **Borders:** 1px `--es-gray-200` everywhere; active/selected = 1–1.5px
  `--es-gray-900`.

### Canvas theme-preset tokens (the diagram shape colors)
These are **scoped per-canvas** (applied to the diagram, not the chrome) and switched
in one click by the Theme presets section. The shapes reference these as CSS custom
properties (`fill: var(--t-fill)` etc.). Three coordinated triads per preset
(`--t-*` primary, `--t2-*` secondary, `--t3-*` tertiary):

```
/* Ocean (default) */
--t-fill:#EFF6FF; --t-stroke:#4F94FF; --t-ink:#0A2F58;   /* blue   */
--t2-fill:#F4FFF6; --t2-stroke:#88D5A5; --t2-ink:#16794C; /* green  */
--t3-fill:#FDFAED; --t3-stroke:#FBCC55; --t3-ink:#91400D; /* amber  */

/* Slate */
--t-fill:#F3F3F3; --t-stroke:#C7C7C7; --t-ink:#171717;
--t2-fill:#E2E2E2; --t2-stroke:#999999; --t2-ink:#383838;
--t3-fill:#FFFFFF; --t3-stroke:#7C7C7C; --t3-ink:#525252;

/* Violet */
--t-fill:#EFEAFE; --t-stroke:#8A6BF0; --t-ink:#3A2A8C;
--t2-fill:#E7F8FB; --t2-stroke:#5BC8E0; --t2-ink:#0B6E84;
--t3-fill:#FCEAF5; --t3-stroke:#E68AC4; --t3-ink:#A8327E;

/* Sunset */
--t-fill:#FFF1E6; --t-stroke:#F6A360; --t-ink:#9A4B0E;
--t2-fill:#FDECEC; --t2-stroke:#F08A8A; --t2-ink:#B52A2A;
--t3-fill:#FFF7D8; --t3-stroke:#EFC53F; --t3-ink:#86600A;
```
New shapes spawn styled with the **primary triad** of the active preset (PRD §5.1 —
never raw black-on-white). Connectors are always neutral `#7C7C7C`, 2.2px stroke
(in logical units).

---

## Screens / Views

### 1. Home dashboard
**Purpose:** browse, organize, and create diagrams.

**Layout:** two-column flex. Fixed **240px** left sidebar + scrollable main pane
(`padding: 26px 34px 60px`).

**Sidebar** (`bg --es-surface-sidebar`, border-right 1px `--es-gray-200`,
`padding: 14px 12px`):
- **Brand row** — 26px violet logomark (rounded square, rx 28%) + "Frappe Draw"
  (15px / 700). See *Assets* for the mark.
- **Search input** — full width, 30px tall, subtle, left search icon (15px), radius 6.
- **Nav** — rows 32px tall, 9px gap icon↔label, radius 6, 13px text. Active row
  ("All diagrams") = `bg --es-surface-gray-2`, 600 weight, `ink-9`. Inactive =
  `ink-7`, 500, hover `bg --es-surface-gray-1`. Items: All diagrams (grid icon),
  Shared with me (users icon), **Trash** (trash icon → opens Trash view).
- **Folders** — uppercase label + "+" button; rows like nav (folder icon):
  "Product specs", "Client work".
- **User footer** (margin-top auto, border-top) — 28px violet circle avatar "TS" +
  name "Tarun S." / "Frappe Cloud".

**Main pane:**
- **Header row** — H1 "All diagrams" (22/700) + meta "7 diagrams · last edited 3
  hours ago" (13/500 `ink-5`); right: **New diagram** primary button (34px, `bg
  gray-900`, white, radius 6, plus icon + label, 13/600).
- **Section header** — uppercase "RECENT" (12/600 `ink-6`) + 1px hairline rule.
- **Tile grid** — `grid-template-columns: repeat(auto-fill, minmax(224px, 1fr));
  gap: 18px`.
  - **Create tile** (first) — 166px tall, 1.5px **dashed** `--es-gray-400` border,
    radius 12, transparent bg; centered 42px gray circle with plus, "New diagram"
    (13/600 `ink-7`). Click → new-diagram popup.
  - **Diagram tile** — radius 12, 1px `--es-gray-200` border, white bg, overflow
    hidden. **Thumbnail** = 120px-tall white area (border-bottom hairline) holding a
    live SVG preview of the diagram (88%×82%, `viewBox 0 0 200 100`,
    `preserveAspectRatio xMidYMid meet`). **Footer** (`padding: 9px 11px`) = title
    (13/600, ellipsis) + meta "Edited 3h ago" (11/500 `ink-5`), and a **⋯ menu
    button** (26px, revealed on tile hover — opacity 0→1).
- **Folder section** — folder icon + "Client work" + count, hairline rule, then its
  own tile grid.

**Tile ⋯ context menu** (popover, 168px, radius 10, `--es-elev-xl`, anchored above
the footer): rows 30px, 12/500 — **Rename**, **Edit description**, **Duplicate**,
hairline, **Delete** (in `--es-red-600`). PRD: delete → Trash, no confirmation.

**Thumbnails:** in production these are cheap, throttled SVG rasterizations
regenerated on save (PRD §11.2/§11.4). On failure show a neutral placeholder, never a
broken image.

---

### 2. New-diagram popup (modal)
**Purpose:** choose a diagram type or a starter template.

**Layout:** scrim `--es-surface-scrim` (rgba(0,0,0,.54)); centered card **680px** wide,
max-height 90vh, radius 16, `--es-elev-2xl`. Click scrim or ✕ to close.
- **Header** — "Create a new diagram" (19/700) + subtitle "Pick a type, or start from
  a template." (13/500 `ink-5`); ✕ icon button top-right.
- **Type row** — 4-column grid, gap 10. **Block diagram** card = enabled, 1.5px
  `gray-900` border, icon + name (13/600) + "Boxes, arrows, flows" (11/500). The other
  three — **Mind map**, **Process chart**, **Whiteboard** — are `bg
  --es-surface-gray-1`, opacity .72, with a "COMING SOON" pill (9/600 uppercase). Only
  Block diagram is clickable → editor.
- **"START FROM A TEMPLATE"** label (11/600 uppercase).
- **Template grid** — 3-column, gap 12. Each card: SVG mini-preview on
  `--es-surface-gray-1` header (border-bottom hairline) + name (12/600). Six
  templates: **Blank canvas, Flowchart, Org chart, SWOT grid, Mind map, Timeline.**
  Any template → editor (PRD: templates are pre-filled JSON documents).

---

### 3. Trash view
Reached from sidebar → Trash. Sidebar collapses to a brand row + "← Back to diagrams".
Main pane: H1 "Trash"; an **amber info banner** (radius 10, `--es-surface-amber-subtle`
bg, `--es-outline-amber` border, warning icon, 13/500 `amber-800`): "Items in trash
are permanently deleted after 30 days." Then a tile grid of trashed diagrams
(thumbnail at .55 opacity) each with **Restore** (outline) + **Delete** (red outline)
buttons. PRD: auto-purge after 30 days; restore returns to home.

---

### 4. Editor
**Purpose:** the diagram workspace. Three zones + top toolbar.

#### 4a. Top toolbar — height **48px**, `bg --es-surface-white`, border-bottom hairline, `padding: 0 12px`
- **Left:** back chevron icon button (30px, → home) · vertical divider · 22px violet
  logomark · **editable title** "Frappe Draw — request flow" (14/600) with a faint
  pencil icon (click-to-edit, Figma/Docs style; default name "Untitled diagram") ·
  **Saved indicator** = green check + "Saved" (12/500 `ink-5`). Production: shows
  "Saving…" during the ~1.5s debounce (PRD §8).
- **Right:** **Export** (outline, download icon + label), **Share** (outline, share
  icon + label), **Print** (outline icon button) · divider · **dark-mode toggle**
  (outline icon button, moon↔sun) · 28px violet avatar. Buttons: 30px tall, radius 6,
  1px `--es-gray-200` border, 13/600.

#### 4b. Left creation palette — width **56px**, `bg white`, border-right hairline, `padding: 8px 0`, items centered, gap 3px, vertical scroll
Icon buttons **38×38**, radius 6, icon ~18–19px, color `ink-7`; hover `bg
--es-surface-gray-2`; active tool = `bg --es-surface-gray-2` + `ink-9`. 24px-wide 1px
dividers between groups. Top-to-bottom (PRD §4.2, by expected popularity):
1. **Search** (filters shapes/icons/emoji by name) · divider
2. **Basic shapes:** Rectangle (active by default), Ellipse, Triangle, Diamond, Text
   box · divider
3. **Connectors:** straight (arrow), elbow, curved · divider
4. **Icons** (Espresso icon library), **Emoji**

Add by **drag-and-drop** or **click-to-draw** (PRD §7.1). Every button has a tooltip
with its name.

#### 4c. Canvas — center, flex 1, `bg #EEEEF0`, overflow auto, contents centered
- **Paper** = fixed-preset white rectangle. Prototype displays the **Widescreen 16:9**
  preset (logical **1280×720**) at **880×495 px** (0.6875 scale). Border 1px
  `#E2E2E2`; shadow `0 1px 3px rgba(0,0,0,.10), 0 12px 36px rgba(0,0,0,.07)`;
  `margin: 48px` (the bounded gray pan area). **The canvas does not auto-grow**; the
  *pan area around it* stretches/shrinks dynamically (PRD §4.1). Other presets in
  PRD §4.1.
- **Rendering:** one **SVG** with `viewBox="0 0 1280 720"`. All geometry (shapes,
  connectors, handles, overlays, grid) lives in logical 1280×720 units so it scales
  crisply at any zoom.
- **Grid guides:** `<pattern>` of dots (24px spacing, r1.5 `#DCDCDF`) rendered
  **under** all shapes; toggled from the bottom palette; **never exported / never in
  thumbnails** (PRD §4.1). Two densities: dense & sparse.
- **Example diagram (the "request flow"):** six shapes —
  `Browser SPA` (blue) → `REST API` (blue) → `Draw Diagram` DocType (green) →
  `MariaDB` rounded-rect (green); a `Online?` **diamond** (amber) below REST; a
  `Thumbnail` rect (amber). Connectors are gray with arrowheads (SVG `marker`); one
  carries a **label pill** "GET /api" (white pill, hairline border, sits at the
  connector midpoint — PRD §6 connector labels).

##### Bottom-center floating palette (PRD §7.1)
Pill bar, `bottom: 18px`, centered, `bg white`, 1px border, radius 10,
`--es-elev-xl`, `padding: 5px`. Buttons 34px:
- **Pointer modes:** Select (active), Hand/pan, Draw (dotted-plus cursor) · divider
- **Grid guides** toggle · divider
- **Zoom:** −, "100%" reset, +, **Fit**. Range 10–400%, 10% steps, cursor-centered
  (PRD §7.7).

> The bottom-**left** "Prototype — review" panel in the file is a **review tool only**
> (palette-layout switch + guides demo). **Do not build it.**

#### 4d. Right modification palette (the GRID layout — BUILD THIS) — width **268px**, `bg white`, border-left hairline, vertical scroll
**Header** (`padding: 11px 14px`, border-bottom hairline): selected-shape name (13/600,
e.g. "Rectangle") + "1 selected" (11/500 `ink-5`); when format painter is active, a
blue pill "Painter on" (10/600, brush icon).

**Sections** — each `padding: 13px 14px`, border-bottom hairline, led by an uppercase
section label (10/600, 0.05em, `ink-5`). Tiles are **one-click action tiles**: 48px
tall, radius 6, 1px `--es-gray-200` border, white bg, 18px icon above a 9px label
(`ink-6`); hover `bg --es-surface-gray-1` + border `--es-gray-400`; active/toggled =
1px `gray-900` border + `bg --es-surface-gray-2`. Laid out in **3-** or **6-column**
grids.

| Section | Tiles (grid) |
|---|---|
| **Arrange** | To front, Forward, Backward (row) · To back, Group, Ungroup (row) — 3-col |
| **Align** | Left, Center, Right, Top, Middle, Bottom — 6-col |
| **Distribute & size** | Dist. H, Dist. V, Remove gaps · Width, Height, Same size — 3-col |
| **Transform** | Swap, Rotate L, Rotate R, Flip H, Flip V, **Painter** (toggle) — 6-col |
| **Fill & border** | Fill swatch row + Border swatch row (6 swatches + "+ more"); Weight field ("2 px") + Style field ("Solid ▾") |
| **Text** | Font field ("Inter ▾") + size field ("16 ▾"); then Bold, Italic, Underline, Left, Center, Right — 6-col |
| **Transparency** | slider (filled track + knob) + "100%" readout |
| **Theme presets** | 2-col cards: Ocean / Slate / Violet / Sunset — each shows 3 swatch bars + name; active = 1.5px gray-900 border |
| **Canvas** | size-preset field ("Widescreen 16:9 · 1280 × 720") + background swatch row |

**Swatch row:** 22px swatches, radius 5, 1px rgba(0,0,0,.10) border, plus a dashed
"+ more colours" swatch. The color picker exposes **Espresso colors only** in v1 (no
arbitrary hex — PRD §11.1). Fill swatches used: `#EFF6FF #F4FFF6 #FDFAED #FCEAF5
#F3F3F3 #171717`. Border swatches: `#4F94FF #88D5A5 #FBCC55 #E68AC4 #999999 #171717`.

**Multi-select rule (PRD §4.3):** show the *intersection* of options applicable to all
selected shapes; changes apply to all at once.

---

## Interactions & behavior

### Selection + handles (PRD §5.2, §5.4)
Click a shape → selection state: a 1.5px **blue dashed** bounding outline + **8 square
resize handles** (4 corners + 4 mid-edges, 14px, white fill, blue 1.5px stroke,
radius 2.5) + a **rotation handle** (a blue line ~36px above top-center ending in a
9px blue-stroked white circle). Esc or click empty canvas deselects.
- Resize: drag any handle; **Shift** preserves aspect ratio.
- Free rotation via the rotation handle; **Shift+rotate** snaps to 0/30/45/60/90°.
- Handles rotate with the shape. When *drawing a connector*, shapes instead reveal
  **circular** anchors (squares vs. circles — never both at once).

### Hover-arrows (signature, PRD §5.3)
Hovering a shape (that isn't selected) reveals **four blue directional arrow buttons**
at its mid-edges (16px white circles, blue 1.5px stroke, blue chevron, offset ~34
logical units outside the shape). Clicking one **spawns a new connected shape of the
same type** in that direction, already linked by a connector and ready for text entry.

### Smart alignment guides + snapping (signature, PRD §7.6)
While dragging, **pink (`#E34AA6`) dashed guidelines** appear whenever the dragged
shape's edge or center aligns with another shape's edge/center or the canvas
border/center — on both axes. A small pink pill labels the match (e.g. "centre").
Guides are momentary (only during drag, only while alignment holds), computed against
axis-aligned bounding boxes, throttled to animation frames. They pair with a **light
snap** (locks within a few px, escapable by continuing to drag).

### Theme presets (signature, PRD §4.3)
Clicking a preset card **restyles the whole diagram in one click** by swapping the
canvas `--t*` token sets (fill/stroke/ink for all three triads). Cheap on SVG+JSON.
Active card gets a gray-900 border.

### Format painter (PRD §4.3)
Click the Painter tile → it toggles active (gray-900 border) and the header shows the
"Painter on" pill. Next shape clicked receives the copied formatting. Click again /
Esc to exit.

### Dark mode (PRD §4.4)
Toolbar toggle sets `[data-theme="dark"]` on the app root → **chrome only** recolors
via the Espresso dark token overrides (`--es-surface-white` → `#1C1C1C`, etc.). The
**canvas paper, shapes, and pan area stay light** (they use literal light values /
`--t*` tokens, not chrome tokens).

### Navigation flow
- Home tile / create tile / popup type / popup template → **Editor**.
- Editor back chevron → **Home**.
- Sidebar Trash → **Trash view**; "Back to diagrams" → **Home**.

### Other (from PRD, staged in prototype)
- Double-click shape → inline text edit (centered default); rulers appear top/left in
  screen space at all zooms (PRD §6).
- Double-click empty canvas → creates last-used (or rectangle) shape at that point in
  text-edit mode (PRD §7.1).
- Keyboard: see PRD §7.3 (Cmd/Ctrl C/X/V, Z/Y, A, D, Delete, Esc; arrow-key nudge,
  Shift+arrows larger).

### States, transitions, motion
- **Animation is quiet:** hover/press ~120ms ease, no scale transforms, no bounce.
- Hover = surface darkens one step; pressed = one step deeper; focus = 2px focus ring
  (`--es-focus-blue` etc.); disabled = 50% opacity.

---

## State management (UI-level)
For the editor/home chrome (the diagram document model lives in PRD §11.3):
- `screen`: `'home' | 'editor'`; `trashView: bool`.
- `dark: bool` → `data-theme` on root.
- `showNewDiagram: bool`.
- `selection: shapeId[]` → drives right-palette header + intersection logic + handles.
- `hoverShapeId: id | null` → hover-arrows (suppressed when shape is selected).
- `draggingGuides`: derived during a drag → smart-guide overlay.
- `themePreset`: `'ocean' | 'slate' | 'violet' | 'sunset'` → canvas `--t*` tokens.
- `formatPainterActive: bool`.
- `gridVisible: bool`, `gridDensity: 'dense' | 'sparse'`.
- `zoom: number` (0.1–4), `canvasSizePreset`, `canvasBackground`.
- `tileMenuOpenId: id | null` (home).

Auto-save (debounced ~1.5s, revision-checked), undo/redo (~50-step in-memory stack),
permissions, thumbnails: all per PRD §8 & §11.4.

---

## Assets
- **Frappe Draw logomark** — invented for this product (no asset existed). A rounded
  square (`rx ≈ 28%`) filled **violet `#6846E3`**, with two small white rounded squares
  (top-left + bottom-right) joined by a white elbow connector — a tiny block diagram.
  Inline SVG (drop into a component):
  ```html
  <svg viewBox="0 0 100 100" width="26" height="26" style="border-radius:8px">
    <rect width="100" height="100" rx="28" fill="#6846E3"/>
    <rect x="28" y="28" width="20" height="20" rx="4" fill="#fff"/>
    <rect x="55" y="55" width="20" height="20" rx="4" fill="#fff"/>
    <path d="M48 38h10a4 4 0 0 1 4 4v13" stroke="#fff" stroke-width="5" fill="none"/>
  </svg>
  ```
- **Icons** — the prototype uses Lucide-style line icons (1.5–1.8px stroke, rounded
  joins) as stand-ins. In production use the **Espresso icon library** (frappe-ui
  `src/components/Icons/`), 16/18px, inheriting `currentColor`. Emoji are *not* chrome.
- **`assets/logomark/frappe.svg`, `assets/wordmark/frappe.svg`** — official Frappe
  marks included for reference (the family style the Draw mark riffs on).
- **`colors_and_type.css`** — full Espresso token set (light + `[data-theme="dark"]`).

---

## Files in this bundle
| File | What it is |
|---|---|
| `Frappe Draw.dc.html` | The hi-fi prototype (HTML/SVG). Home + Editor + popup + Trash, all states. **Reference only** — the right palette to build is the **Grid** layout; the List/Compact variants and the bottom-left review panel are not product. |
| `colors_and_type.css` | Espresso design tokens (CSS variables) + helper classes. |
| `assets/logomark/frappe.svg`, `assets/wordmark/frappe.svg` | Official Frappe brand marks (style reference). |
| `README.md` | This document. |

> The `.dc.html` prototype was built in a streaming-component tool and may not run as a
> plain static file outside it. Use it to read structure/values; rely on this README +
> the PRD as the source of truth. (Ask for exported screenshots if you'd like flat
> visual references.)
