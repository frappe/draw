# Frappe Draw — Product Specification (v1)

**Status:** Draft v3 — P0 + P1 + P2 review decisions integrated; differentiation features in v1
**Audience:** Frappe technical team + Claude Code (implementation)
**Author:** Product owner, compiled from ideation sessions

---

## 1. Vision & Objective

Frappe Draw is a diagram creation app. The long-term ambition is a tool covering block diagrams, mind maps (Whimsical-style), process charts, and hand-drawn whiteboards — potentially evolving toward Canva-like territory.

**The guiding objective for every design decision: make creating diagrams an extremely easy experience.**

### The opinionated stance (what makes Frappe Draw different)
- **One-click everything.** The right-hand tile palette does in one click what competitors bury in panels and dialogs.
- **Beautiful by default.** Every shape spawns with a designed style — never raw black-on-white.
- **Bounded, not infinite.** The canvas has visible edges. Users never get lost (the anti-Miro position).
- **Curated, not exhaustive.** A palette small enough to know, not a junk drawer (the anti-draw.io position).
- **Generous.** No artificial limits on shapes or diagrams; all export formats free (the anti-Lucidchart position).
- **Frappe-native.** Lives inside the Frappe ecosystem — the structural moat no competitor can copy.

### v1 Scope

| Diagram type | v1 status |
|---|---|
| Block diagram | **Build now** |
| Mind map (expandable/collapsible tree, curved connectors) | Coming soon (shown in picker, disabled) |
| Process chart | Coming soon (needs research) |
| Hand-drawn whiteboard | Coming soon |

v1 is a frontend-first, **online-only**, **desktop-browser** app.

---

## 2. Home Screen (Dashboard)

A grid of diagram tiles in rows and columns.

### Empty state
- A single tile with **dotted-line borders and a centered plus sign** — the call to action.
- Faint hint text guides the first-time user.
- Clicking the plus opens the **new-diagram popup**.

### New-diagram popup
- Lists the four diagram types. Only "Block diagram" is enabled; the other three are visible but labeled "Coming soon."
- Below the types: **starter templates** — 4–6 pre-filled diagrams (e.g., simple flowchart, org chart, SWOT grid, basic mind-map layout, blank). Selecting one opens the editor pre-populated. (Templates are just pre-filled JSON documents.)

### Populated state
- Each diagram appears as a tile. New diagrams insert at **position 1 of the unsectioned area**, pushing others right/down; any manual ordering is otherwise preserved.
- **Tile content:** live thumbnail preview. Thumbnails are cheap — regenerated on save (throttled), never continuously rendered. On generation failure, show a neutral placeholder, never a broken image.
- **Sort order:** creation order by default; user can drag tiles to reorder manually.
- **Tile context menu (⋯):** Rename / Edit description / Duplicate / Delete.

### Deletion & Trash
- Deleting a diagram moves it to **Trash** (no confirmation — trash is the safety net).
- Trash is accessible from the home screen; trashed diagrams can be **restored** or **permanently deleted**.
- Trashed diagrams **auto-purge after 30 days** (scheduled job).

### Organization
- Users can create **sections/folders**, rendered as named horizontal groups. Drag a tile into a section to file it.

---

## 3. Diagram Metadata & URLs

- Every diagram has a **title** and **description**.
- **Title** is editable inline at the top-left of the editor toolbar (click-to-edit, Figma/Docs style); default name **"Untitled diagram"**.
- **Description** is editable from the tile context menu.
- Every diagram has a **unique URL** that serves as its permanent identity.

---

## 4. Editor Layout

Three zones plus a top toolbar.

### 4.1 Center — Canvas

**Canvas sizes (fixed presets).** The canvas is always one of a set of standard sizes (chosen in the new-diagram popup, changeable later from the right palette). Logical-unit dimensions:

| Preset | Dimensions | Use |
|---|---|---|
| Widescreen 16:9 | 1280 × 720 | Default — slides, general diagrams |
| Standard 4:3 | 1024 × 768 | Classic slides |
| A4 Landscape | 1123 × 794 | Print |
| A4 Portrait | 794 × 1123 | Print, documents |
| Letter Landscape | 1056 × 816 | Print (US) |
| Letter Portrait | 816 × 1056 | Print (US) |
| Square | 1080 × 1080 | Social / balanced diagrams |

> **Print-accuracy note:** the A4/Letter dimensions above are approximate pixel values at ~96 DPI. For pixel-accurate print output, the print stylesheet should tie these presets to their **real physical dimensions** (A4 = 210 × 297 mm; Letter = 8.5 × 11 in) using mm/point units rather than pixels, so printed pages aren't subtly scaled.

**The canvas itself does not auto-grow.** It is a fixed-size white rectangle (the chosen preset).

**The space *around* the canvas (the gray pan area) is dynamic:**
- By default it is **minimal** — only a few pixels of gray margin around the canvas, so accidental scrolls don't drift into empty space.
- If a shape is dragged **beyond the canvas edge**, the pan area **stretches** on that side to accommodate it — no limit; it can extend as far as the farthest shape plus a few pixels of margin.
- If that shape is later moved back inside, the pan area **auto-shrinks** back toward the minimal margin.
- **Net rule:** minimum pannable region = canvas + small margin; maximum pannable region in any direction = a few pixels beyond the farthest shape in that direction.
- Scrollbars appear automatically whenever the pannable region exceeds the viewport (from stretch or zoom).

**Canvas background:**
- Default is **"no color"** — renders white in the editor, but exports with a **transparent** background (shapes only) for PNG/SVG/PDF.
- The user can set **any color**; a colored background exports as part of the full image.

**Grid guides:**
- Toggleable dotted/checkered overlay — **never part of the diagram**, never exported, excluded from thumbnails.
- Two densities: **dense** (small) and **sparse** (large).
- Renders **under** all shapes. Toggle lives on the floating bottom-center palette (see 7.1).

### 4.2 Left — Creation Palette
Vertical toolbar; elements added by **drag-and-drop** or **click-to-draw**. Top-to-bottom by expected popularity:

1. **Basic shapes** — ellipse/circle, rectangle, square, triangle, diamond, and other standard shapes.
2. **Connectors** — straight, curved, elbow lines; single- and double-headed arrows.
3. **Icons** — from the **Espresso icon library**.
4. **Emojis and other elements** — at the bottom.

A **search/filter input** sits at the top of the palette to filter shapes, icons, and emojis by name (critical once icons/emojis are present).

### 4.3 Right — Modification Palette
Inspired by the Efficient Elements PowerPoint add-in: sections of **one-click action tiles**.

- **Arrange** — bring to front / forward / backward / to back; group / ungroup.
- **Align** — left/center/right, top/middle/bottom. Aligns relative to a **reference object** (first- or last-selected), with align-to-canvas as an option.
- **Distribute** — equal horizontal/vertical spacing for 3+ shapes; remove gaps (stack flush).
- **Same size** — match selected shapes to a reference: same width / height / both.
- **Swap** — swap positions of two selected shapes.
- **Rotate / Flip** — rotate 90° left/right; flip horizontal/vertical. (Free rotation also available on canvas — 5.4.)
- **Fill** — color.
- **Border** — color, weight, style; for lines/connectors also **stroke width and dash style**.
- **Text/Font** — see 6 (font controls).
- **Transparency.**
- **Format painter** — copy all formatting from one shape, apply to others.
- **Theme presets** — 3–4 curated, coordinated color sets (fill/border/text) applied diagram-wide in one click. Cheap on SVG+JSON; the most Canva-like "wow" in v1.
- **Canvas controls** — change canvas size preset; set canvas background color.

> Tile set derived from general knowledge of Efficient Elements; cross-check the actual add-in once before build.

**Multi-select rule:** the palette shows the *intersection* of options applicable to all selected shapes (e.g., circle + line → no fill; border/arrange/align remain). Changes apply to every selected shape at once.

### 4.4 Top — Toolbar
Minimalistic. Left: editable diagram title + a subtle **Saved / Saving…** indicator (trust signal for a no-save-button app). Right corner:
- **Export** — PNG, JPEG, SVG, PDF.
- **Share** — see 9.
- **Print** — native browser print dialog (Save as PDF, device printers, orientation wizard). Output is **canvas content only** (print stylesheet hides chrome).
- **Dark mode toggle** — affects **only the chrome** (toolbar + palettes), never the canvas.

---

## 5. Shapes

### 5.1 Shape set
Ellipse (Shift → circle), rectangle (Shift → square), square, triangle, diamond. **Text box** behaves as a shape in all respects but renders with no border or fill. New shapes spawn with a **designed default style** (curated fill, border, Inter text) — never raw black-on-white.

### 5.2 Anchor points vs. resize handles
Every shape has **8 key points** (4 mid-edges + 4 corners), disambiguated by context:
- **Selected** → 8 **square resize handles**.
- **Drawing/dragging a connector** → nearby shapes reveal their 8 points as **small circular anchors** on hover.
- Visually distinct (squares vs. circles); never shown together on the same shape. Anchors rotate with the shape.

### 5.3 Connectors
**Types:** straight, curved, elbow. Any line convertible to an arrow (single/double head).

**Drawing between shapes:** click connector tile → draw mode → press near a shape (start snaps to nearest anchor) → drag → release near another shape (end snaps to its anchor). **Unattached connectors allowed** (endpoints on empty canvas).

**Editing:** selecting a connector shows draggable endpoints to re-attach or detach. Curved connectors show a **midpoint control handle**. Elbow connectors use a simple 3-segment route in v1 — **no auto-routing around shapes**.

**Hover-arrows (differentiation, v1):** hovering a shape reveals four small directional arrows at its mid-edges. Clicking one **spawns a new connected shape** of the same type in that direction, already linked by a connector and ready for text entry. Turns repetitive draw-connect-type cycles into single clicks — the strongest expression of the "extremely easy" objective.

**Attachment rule:** a connector attached to an anchor follows the shape when it moves or rotates.

### 5.4 Resize & rotation
- **Resize:** drag any of the 8 handles; Shift preserves aspect ratio.
- **Free rotation:** a **rotation handle** above top-center rotates the shape to any angle. **Shift + rotate** snaps to the fixed-angle family (0/30/45/60/90° and multiples around the full circle).
- Right-palette 90° rotate / flip tiles coexist with free rotation.
- Anchors rotate with the shape; alignment guides (7.6) use the rotated shape's **axis-aligned bounding box**.

---

## 6. Text in Shapes

- Every element — including connectors — can contain text.
- **Double-click** any shape → text-edit mode immediately. Default alignment: horizontally and vertically centered.
- While editing, **rulers** appear along the canvas top and left, in screen space, correct at all zoom levels. User can change horizontal alignment and adjust the text box's width/height within the shape.
- **Formatting (v1):** **Inter** as the single default font (no font-family picker in v1 — keeps export/print consistent). Controls: size, bold, italic, underline, text color, left/center/right alignment.
- **Overflow:** text wraps; if it still overflows vertically, the **shape auto-grows vertically**. For diamonds/triangles the text area is the **inscribed rectangle**.
- **Connector labels:** sit at the connector midpoint, horizontal, in a small pill filled with the canvas background color; move with the line.

---

## 7. Interactions

### 7.1 Pointer modes
1. **Arrow pointer** (default) — add, select, move, edit.
2. **Hand pointer** — grab and pan the canvas.
3. **Draw pointer** — active after clicking a shape tile; cursor becomes a **dotted-line plus** (final glyph per Espresso).

Mode switcher lives on the top toolbar or a **Figma-style floating bottom-center palette** (final placement at design time). The floating palette also hosts the grid-guide toggle, zoom indicator, and Fit / 100% controls.

**Click-to-draw flow:** click shape tile → draw pointer → press-and-hold on canvas to start → drag to size → release to finalize → cursor reverts to arrow. Coexists with drag-and-drop.

**Double-click empty canvas (differentiation, v1):** creates a default shape (last-used, or rectangle) at that point, already in text-edit mode.

### 7.2 Selection, duplication & deletion
- **Click** = select one; **Shift+click** = add/remove from selection; **click-drag on empty canvas** = marquee select; **Cmd/Ctrl+A** = select all; **Esc** / click empty canvas = deselect (Esc also exits draw and text-edit modes).
- **Cmd/Ctrl+D** = duplicate (offset +10/+10). **Delete / Backspace** = delete selection (undo-recoverable).

### 7.3 Keyboard shortcuts (deliberately minimal)
| Shortcut | Action |
|---|---|
| Cmd/Ctrl + C / X / V | Copy / Cut / Paste |
| Cmd/Ctrl + Z / Y | Undo / Redo |
| Cmd/Ctrl + A | Select all |
| Cmd/Ctrl + D | Duplicate |
| Delete / Backspace | Delete selection |
| Esc | Deselect / exit current mode |
| Cmd/Ctrl + N | New diagram — **deferred (v2)** |

**Copy/paste semantics:** paste offsets +10/+10 from source; **internal app clipboard only** in v1 (no OS-clipboard image paste); copied connectors keep attachments only if both endpoint shapes are in the selection.

### 7.4 Shift as constraint modifier
- **Shift + draw/resize shape** → 1:1 aspect (circle, square…).
- **Shift + draw line** → fixed angles only (0/30/45/60/90°).
- **Shift + rotate** → snaps to the same fixed-angle family.

### 7.5 Nudging
Arrow keys nudge the selection in small increments; **Shift + arrows** = larger increments.

### 7.6 Smart alignment guides
While dragging a shape, **live guidelines** appear whenever its left/right/top/bottom edge or horizontal/vertical center aligns with the corresponding position of **any other shape** or the **canvas border/center**, in both axes.

Worked example (horizontal): dragging a rectangle toward a far circle, guidelines appear successively as the rectangle's left edge meets the circle's right edge, then its center, then as the two centers align — and so on for every edge/center pairing.

Guides are momentary (only during drag, only while alignment holds), computed against bounding boxes (rotated shapes use their axis-aligned box), throttled to animation frames.

**Snapping:** guides pair with a light snap — the shape locks onto alignment within a few pixels, escapable by continuing to drag.

### 7.7 Zoom & pan
- **Zoom:** Shift+scroll **or** Ctrl/Cmd+scroll **or** Ctrl/Cmd+(+/−). Default 100%, 10% steps, **10%–400%**, **cursor-centered**.
- **Plain scroll** pans vertically; **Shift+scroll** is also accepted as horizontal pan where zoom isn't active. (No spacebar-hold pan.)
- A **zoom indicator** with **Fit** and **100%** one-click options lives on the floating palette.
- Scrollbars appear when the pannable region exceeds the viewport.
- Implementation note: intercept browser-default Ctrl+scroll / Ctrl+/− zoom.

---

## 8. Saving & Connectivity

- **Continuous auto-save while online**, debounced ~1.5s after the last change. No manual save button. Visible **Saved / Saving…** indicator.
- **Offline (no support in v1):** the freeze overlay triggers only after **~5s** of failed connectivity (avoids flicker on flaky links). Latest unsaved state is held in memory and **flushed immediately on reconnect**, so no edits are lost.
- **Two-tab / concurrent-edit conflict:** last-write-wins, but each save checks the server **revision** first; if a newer revision exists, freeze with "This diagram was changed elsewhere — reload."

---

## 9. Sharing & Viewer

- **Share control:** a single **"Allow global access"** toggle (**off by default**) + **Copy link**.
  - Off → only the owner can open the URL. Visiting without access shows a **"You need access"** page (not a 404).
  - On → anyone with the link gets **view-only** access.
- **Viewer page:** a clean route — **canvas only, no palettes**; zoom and pan allowed; **export not allowed**; a small "Made with Frappe Draw" footer.

---

## 10. Export

- Formats: **PNG, JPEG, SVG, PDF**, run **client-side**.
- Export captures the **canvas bounds**, not the viewport.
- **PNG** offered at **1× and 2×**.
- **JPEG** has no transparency → a "no color" canvas exports with a **white** background.
- **SVG / PDF** preserve transparency.
- Grid guides are never included.

---

## 11. Technical Guardrails

Follows Frappe ecosystem norms (Gameplan, Frappe Drive, Frappe Insights patterns).

### 11.1 Architecture
- Standard **bench-installable Frappe app** (working name `draw`).
- **Backend:** Frappe (Python, MariaDB).
- **Frontend:** **Vue 3 + frappe-ui + Tailwind** SPA at the app route.
- **Design system:** Espresso — including the **color palette** (the color picker exposes Espresso colors only: a curated set + recent + the system's defined values; no arbitrary hex in v1).
- **Default font:** Inter.

### 11.2 Rendering
- Canvas rendered as **SVG DOM** (not HTML `<canvas>`): native hit-testing, crisp at all zoom, near-free SVG export. Thumbnails and PNG/JPEG produced client-side by rasterizing the same SVG.
- Grid renders under shapes and is excluded from thumbnails/exports.

### 11.3 Data model
- **`Draw Diagram` DocType:** title, description, folder (link), `document` (Long Text / JSON — entire diagram), `canvas_size`, `is_public` (check), `revision` (int, ++ on each save), `is_trashed` + `trashed_on`, thumbnail (attach), `order` (int).
- **`Draw Folder` DocType:** name, order.
- **Diagram JSON schema (`schemaVersion` field; single source of truth):**
  - `canvas`: sizePreset, width, height, background
  - `shapes[]`: id, type, x, y, w, h, rotation, fill, border {color, width, dash}, opacity, text {content, align, valign, style}, zIndex
  - `connectors[]`: id, type, from/to (`{shapeId, anchor}` or `{x, y}`), arrowheads, style, label
- Keep the schema clean and versioned — templates, theme presets, hover-arrows, and future diagram types all build on it.

### 11.4 Persistence & state
- **Auto-save:** debounced ~1.5s via standard Frappe REST API; revision-checked (see 8).
- **Undo/redo:** in-memory command stack, ~50 steps, cleared on reload.
- **Permissions:** Frappe user = owner; `is_public` enables guest **read-only** access via a guest-allowed endpoint; all else requires login + ownership.
- **Thumbnails:** generated client-side on save, throttled to ≤ once / 30s, stored as a file attachment.

### 11.5 Performance, platform & accessibility
- **Performance budget:** smooth **60fps** dragging at **300+ shapes**; alignment-guide checks O(n) over bounding boxes, throttled to animation frames. **No artificial limits** on shapes/diagrams.
- **Platform:** desktop browsers only (Chrome/Edge/Firefox/Safari, last 2 versions); min width **1280px**; no touch/mobile editor. The **viewer page** may be mobile-friendly.
- **Accessibility minimum:** Esc always exits the current mode; visible focus states; palette buttons have tooltips with names (and shortcut where applicable). Full a11y is post-v1.
- **Error states:** export/share failures → toast with retry; thumbnail failure → placeholder.

### 11.6 Development discipline
- One feature per Claude Code session; **build → test in browser → git commit** before the next.
- Each build step ships with its **acceptance criteria** met (see 14).

---

## 12. Dependencies & Inputs Needed
- **Espresso icon library + color palette** — internal Frappe assets; technical team to integrate.
- Frappe environment (bench or Frappe Cloud) — handled by the technical team.

---

## 13. Deferred to v2 (needs more deliberation or carries expected risk)

Only items with genuine open questions or implementation risk are held back:

- **Version history** — automatic snapshots with browse/restore. Open questions: storage strategy, snapshot cadence, diffing/restore UX.
- **Selective export** — export a chosen subset of shapes as a diagram. Held for deliberation on bounds/cropping behavior.
- **Cmd/Ctrl+N new-diagram shortcut** — unresolved conflict behavior.
- **Other diagram types** — mind maps, process charts, hand-drawn whiteboard (picker shows "coming soon"; process charts need research).
- **Collaborative / multi-user editing** — large, separate effort.
- **Offline support** — explicitly out.
- **Connector auto-routing around shapes** — hard layout problem.
- **Rich arrowhead/end-style library** — beyond single/double heads.
- **OS-clipboard image paste**, **font-family picker**, **arbitrary hex colors**, **multi-level group nesting**, **auto-layout / "tidy up"**, **comments**, **presentation mode**, **AI / text-to-diagram (Mermaid import)** — future.

---

## 14. Build Order (for Claude Code — one feature per session)

Each step: build → test in browser → commit. Each lists **acceptance criteria (AC)** — the "definition of done" for that session.

**0. Foundation.** Frappe app scaffold; `Draw Diagram` / `Draw Folder` DocTypes; JSON schema; Vue 3 + frappe-ui SPA shell; SVG canvas with pan/zoom stub.
*AC:* app installs on bench; visiting the route loads the SPA; a diagram doc can be created and read via API; an empty SVG canvas renders with working pan and zoom.

**1. Home screen shell.** Empty state with dotted create tile + hint; new-diagram popup (one type enabled, three "coming soon"); template list stub.
*AC:* empty state renders; popup opens; selecting "Block diagram" routes to the editor with a new doc.

**2. Editor shell.** Three-zone layout + top toolbar; fixed-preset white canvas with minimal gray margin; canvas-size presets selectable.
*AC:* all three zones render; switching size preset resizes the canvas; minimal margin shows; dark mode toggles chrome only.

**3. Shape basics.** Drag-drop + click-to-draw rectangle/ellipse; select, move, resize, Shift 1:1; marquee + Shift-click multi-select; delete; duplicate; designed default style on spawn.
*AC:* both add methods work; shapes select/move/resize; multi-select works; delete + Cmd+D work; new shapes look styled, not raw.

**4. Remaining shapes + rotation.** Square, triangle, diamond, text box; free rotation handle + Shift angle snap.
*AC:* all shapes draw correctly; rotation handle rotates freely; Shift snaps to the angle family; text box renders borderless.

**5. Anchors + connectors + hover-arrows.** Handle/anchor disambiguation; snap-to-anchor connector drawing; attach/follow on move+rotate; straight/curved(midpoint)/elbow; arrows; unattached connectors; endpoint re-drag; hover-arrow spawn.
*AC:* connectors snap to anchors and follow shapes; all three types draw; endpoints re-attach; hover-arrows spawn a connected shape.

**6. Text.** Double-click edit; centered defaults; rulers at all zooms; alignment + text-box sizing; auto-grow overflow; Inter + size/B/I/U/color; connector labels; double-click-empty-canvas create.
*AC:* text edits inline; rulers correct after zoom; overflow grows the shape; connector labels render in a pill; empty-canvas double-click creates a shape in edit mode.

**7. Right palette.** Arrange, Align (reference-object), Distribute, Same size, Swap, Rotate/Flip, Fill, Border (+stroke/dash), Font, Transparency, Format painter, Theme presets, Canvas controls; multi-select intersection logic; palette search.
*AC:* each tile performs its action in one click; intersection logic hides inapplicable tiles; theme preset restyles the whole diagram; search filters the left palette.

**8. Keyboard + clipboard.** Copy/cut/paste (internal clipboard, +10 offset, connector-attachment rule), undo/redo (~50-step stack), select-all, Esc, nudging.
*AC:* all shortcuts behave per 7.3; undo/redo is reliable across actions; nudging + Shift-nudging work.

**9. Smart guides + grid + background.** Alignment guidelines + snapping; grid overlay (dense/sparse); canvas background color (incl. transparent default).
*AC:* guides appear/snap on every edge/center pairing and against canvas; grid toggles and never exports; background color applies and exports correctly.

**10. Zoom & pan polish.** 10% steps, 10–400%, cursor-centered; multi-gesture zoom; vertical/horizontal scroll-pan; dynamic pan-area stretch + auto-shrink; Fit/100%; scrollbars; browser-gesture interception.
*AC:* zoom is cursor-centered and clamped; pan area stretches when a shape leaves the canvas and shrinks when it returns; Fit/100% work; browser zoom never hijacks.

**11. Persistence + connectivity.** Auto-save (1.5s, revision-checked); title/description; Saved/Saving indicator; offline freeze (5s, flush on reconnect); two-tab conflict handling.
*AC:* edits persist within 1.5s; indicator reflects state; pulling the network freezes after ~5s and recovers without data loss; stale-revision save is blocked with a reload prompt.

**12. Home screen completion.** Cheap throttled thumbnails (placeholder on fail); drag reorder; sections/folders; tile context menu; Trash (restore + 30-day purge job); starter templates populated.
*AC:* tiles show thumbnails; reorder persists; folders work; delete→trash→restore works; purge job scheduled; templates open pre-filled.

**13. Share, export, print.** Global-access toggle + copy link; viewer route (canvas only, no export, footer); access-denied page; PNG(1×/2×)/JPEG/SVG/PDF; print stylesheet (canvas only).
*AC:* toggling access changes URL accessibility; viewer renders read-only without palettes or export; all four exports produce correct files with correct transparency; print shows canvas only.

**14. Final polish.** Empty/error states, tooltips, focus states, performance pass against the 300-shape budget.
*AC:* all hygiene states present; 60fps drag at 300+ shapes; no broken-image or unhandled-error states.
