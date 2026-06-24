# Frappe Draw — Specialized Diagram Types Specification
## Mind Map · Flowchart / Decision Tree · Whiteboard

**Single-source build spec.** This document fully specifies three new diagram types to be added to the existing Frappe Draw app. It is self-contained: implement everything described here as one cohesive scope, in the build order given.

---

## ⚠️ NON-NEGOTIABLE BUILD CONSTRAINTS — READ FIRST
These override any conflicting detail elsewhere. Do not deviate without explicit product-owner approval.

1. **Use Frappe UI / Espresso styling.** The entire interface uses the `frappe-ui` component library and the Espresso design system (colors, icons, typography). No other UI kits, no arbitrary styling. The color picker exposes Espresso colors only. Default font is **Inter**.
2. **SPA with a rich, polished UI — NOT the Frappe Desk.** This is a standalone, custom-designed Single-Page Application served at the app's own route. Do not build inside Desk, do not use Desk list/form views, do not ship a Desk-themed experience.
3. **Do not break the existing v1 block-diagram editor.** The block-diagram type already works in this codebase. All new work is additive. The shared engine is reused, never rebuilt or regressed.

---

## 0. Foundation — what already exists and must be reused

The app already ships a working **block-diagram** editor. These new types are **mode modules layered on the same engine.** Reuse, do not re-implement:

- SVG-DOM canvas with pan/zoom, scrollbars, grid guides (dense/sparse), canvas background color
- Shape primitives, the 8-point anchor/resize-handle model, free rotation, Shift constraints
- Connector system (straight/curved/elbow; attach-and-follow; midpoint labels)
- Text editing (Inter, double-click-to-edit, auto-grow, alignment)
- Right modification palette (one-click tiles), left creation palette (with search), floating bottom palette
- Smart alignment guides + snapping
- Auto-save (debounced ~1.5s, revision-checked), Trash (restore + 30-day purge), share + read-only viewer, export (PNG/JPEG/SVG/PDF), print (canvas only)
- The diagram JSON document model + `Draw Diagram` DocType, frappe-ui + Vue 3 + Tailwind SPA, Espresso design system

**Architecture rule:** a diagram's `diagramType` field (`block` | `mindmap` | `flowchart` | `whiteboard`) selects the active **mode module**, which configures which tools appear, which creation interactions are live, and whether an auto-layout engine runs. The renderer, data model, persistence, share, export, and print stay common. The new-diagram popup already lists all four types; this work activates the three currently labeled "coming soon."

**Mode is fixed per diagram:** the type is chosen at creation and does not change afterward (converting between types is explicitly out of scope).

---

## 1. Adopted design decisions

- **Canvas model.** Mind Map and Whiteboard use a **freely auto-expanding canvas**; Flowchart uses a bounded canvas with base growth behavior.
- **Mind Map is pure auto-layout.** Node positions are computed; dragging only re-parents or reorders.
- **Flowchart allows manual placement + one-click "Tidy up."** New nodes auto-place with clean spacing and column/lane snapping; user can move them; Tidy re-flows.
- **Flowchart connectors route orthogonally** (elbow) with arrowheads, re-route as nodes move — no obstacle-avoidance (overlapping routes offset slightly).
- **Whiteboard pen is vector with stroke-level erase.** Smoothed vector paths; eraser removes whole strokes.

---

# PART A — MIND MAP

### A1. Purpose
Fast, keyboard-driven idea trees (Whimsical style). Type and press keys; layout takes care of itself.

### A2. Canvas
Auto-expanding; Fit-to-view + 100% on floating palette; open at fit-to-view.

### A3. Node model
- A **tree**: one **root**; every other node has one parent and 0+ children.
- Node visual: a **rounded pill**, auto-sized to text (Inter), wrapping multi-line.
- **Root** visually distinct (larger, heavier).
- **Branch coloring:** each first-level branch auto-assigned an Espresso color; descendants inherit (optionally lightening with depth); overridable; theme presets re-assign.
- **Collapse/expand:** any node with children shows a toggle; collapsed nodes show a **count badge**.
- **Node markers:** one-click Espresso icon + color dot per node (curated).
- **Node notes:** optional longer text, shown on hover + side panel.

### A4. Connectors
- **Curved (bezier)** parent→child, branch-colored, **no arrowheads**; implicit with relationship.
- **Cross-link relationship connector:** dotted, optionally labeled non-tree connector between any two nodes; rendered distinctly.

### A5. Creation & interaction (keyboard-first)
| Action | Result |
|---|---|
| **Tab** | Add **child** to selected node; enter edit mode |
| **Enter** | Add **sibling** after selected; enter edit mode |
| **Shift+Enter** | New line within node text |
| **Esc** | Exit text edit (keep node) |
| **Delete/Backspace** (selected, not editing) | Delete node; if children, confirm then delete subtree |
| **Arrow keys** | **Navigate** selection (up/down = siblings, left/right = parent/child) — arrows navigate, not nudge |
| **Shift+Tab** (selected, not editing) | **Promote** (outdent). Demote by dragging onto a sibling. |
| **Alt+↑ / Alt+↓** | **Reorder** among siblings |
| **Drag node onto another** | Re-parent under target |
| **Drag among siblings** | Reorder |
| **Paste multi-line indented/bulleted text** | Build matching **subtree** |
| **Double-click / click text** | Edit node text |
| Collapse toggle click | Collapse/expand subtree |

New nodes spawn styled and connected. Tree **re-lays-out with smooth animation** on every change.

### A6. Layout engine
Horizontal, **balanced two-sided** (root centered; first-level branches left/right; subtrees grow outward, children stacked, evenly spaced). Deterministic spacing; collapsed subtrees occupy zero space. O(n), throttled to animation frames.

### A7. Outline view
Toggleable side panel: indented editable outline. Two-way sync with the map. Keyboard-first; accessibility aid.

### A8. Focus mode
Toggle dims/collapses everything except the selected node's branch.

### A9. Right palette (mind-map mode)
Node Fill/text color, Font size, branch color, marker (icon+dot), collapse/expand all, focus-mode toggle, outline-view toggle, theme presets. Hides free Arrange/Align/Distribute/Same-size/Swap/Rotate. Multi-select applies color/size/marker.

### A10. Empty state
Single pre-placed root centered, "Central idea", caret ready. Hint: "Press Tab to add a branch, Enter for a sibling."

### A11. Data model
```
diagramType: "mindmap"
mindmap: {
  rootId,
  nodes: [ { id, parentId, text, order, collapsed, color, depth,
             marker: { icon, colorDot }, note } ],
  crosslinks: [ { id, fromId, toId, label } ],
  layout: "balanced"
}
```
Positions derived at render time (optionally cached for thumbnails).

### A12. Edge cases & glitches to avoid
- Block re-parenting a node into its own descendant (cycle prevention).
- Disallow deleting the root (offer "clear map" with confirm).
- Long text wraps, never overflows the pill.
- Collapse/expand + re-layout animations must not fight auto-save (debounce until settled).
- Deep/wide trees stay at 60fps.

---

# PART B — FLOWCHART / DECISION TREE

### B1. Purpose
Fast structured connected flows / decision trees. No free-floating shapes — every node is part of the flow. Build by extending from existing nodes.

### B2. Canvas
Bounded with base growth. Default flow **top-to-bottom**; toggle for **left-to-right**.

### B3. Node types (curated set)
| Type | Shape | Use |
|---|---|---|
| **Start/End (Terminator)** | Stadium/pill | Entry/exit |
| **Process** | Rectangle | Action/step |
| **Decision** | Diamond | Branch point with labeled outputs |
| **Input/Output** | Parallelogram | Data in/out |
| **Connector/Junction** | Small circle | Merge/reroute |

Designed default style; theme presets apply coordinated colors.

### B4. Creation flow
- New flowchart starts with a single **Start** terminator pre-placed.
- Selecting/hovering a node reveals **"+" handles on its outgoing edge(s)** (bottom in TB).
- Clicking "+" opens a compact **node-type picker**; choosing creates that node one level down, **auto-connects** with arrowed elbow, **auto-positions** in column/lane.
- **Decision** exposes **multiple labeled "+" outputs** (default "Yes"/"No", editable; more addable). Branches auto-balance symmetrically.

### B5. Keyboard flow-building
Node selected: **Enter**→Process, **D**→Decision, **T**→Terminator, **I**→Input/Output (Mermaid speed, zero syntax).

### B6. Connectors
- **Orthogonal/elbow** with **arrowheads**, attach to logical ports (bottom→top), re-route orthogonally as nodes move; no obstacle-avoidance (overlapping offset slightly).
- Connectors carry **labels** (midpoint pill) — essential on decision branches.
- Manual connectors allowed (base tool).
- **Drag-connector-to-empty → type prompt:** opens node-type picker, creates the connected node there.

### B7. Layout & editing
- New nodes auto-place, snap to columns/lanes; nodes movable; connectors follow.
- **"Tidy up"** re-flows whole chart in one undoable step.
- **Node-type swap:** convert node type, preserving connections.
- **Insert-in-the-middle with auto-reflow:** dropping a node onto a connector splices it in; downstream reflows.

### B8. Right palette (flowchart mode)
Node Fill/Border/text, node-type swap, Tidy up, flow-direction toggle, Align/Distribute, arrowhead style, branch-label edit, theme presets.

### B9. Empty state
Single Start terminator centered, hint: "Click the + below a node to add the next step — or press Enter."

### B10. Data model
```
diagramType: "flowchart"
flowchart: {
  direction: "TB" | "LR",
  nodes: [ { id, nodeType, text, x, y, fill, border, branches:[{port,label}] } ],
  edges: [ { id, from:{nodeId,port}, to:{nodeId,port}, label, arrowheads,
             routing:"orthogonal", kind:"flow"|"manual" } ]
}
```

### B11. Edge cases & glitches to avoid
- Node-type swap preserves edges.
- Deleting a node cleanly removes/stubs edges (no dangling arrows).
- Decision branch labels stay attached through moves/re-routes.
- "Tidy up" and insert-reflow each a single undoable step.
- Overlapping orthogonal connectors offset.

---

# PART C — WHITEBOARD

### C1. Purpose
Free-form surface: type anywhere, draw freehand, drop stickies, add shapes, connect anything. Hand-drawn character.

### C2. Canvas
Large, freely auto-expanding; fit-to-view, 100%, small **minimap**.

### C3. Element types
- **Text** — double-click anywhere creates a text box (headline interaction).
- **Freehand pen** — smoothed vector strokes; Espresso color + thickness; **highlighter** variant.
- **Eraser** — deletes whole strokes (path hit-test).
- **Sticky notes** — Espresso colors, auto-contrast text; resizable/draggable; Tab drops adjacent note; number keys 1–9 pick colors.
- **Shapes & connectors** — full base set.
- **Hyperlinks** — any object links to a URL or another Frappe Draw diagram.

### C4. Hand-drawn / sketch style
Toggle (per-object or board-wide) renders shapes/connectors/borders sketchy (roughen pass over SVG).

### C5. Laser pointer
Self-fading trail; no persistent marks.

### C6. Tools (floating bottom palette primary)
Select · Hand · Pen · Highlighter · Eraser · Text · Sticky · Shapes · Connector · Laser.

### C7. Right palette (whiteboard mode)
Context-sensitive: pen→color+thickness; sticky→color; shapes/text→base styling; sketch toggle; theme presets. Arrange/Align/Distribute available.

### C8. Empty state
Faint center hint: "Double-click to type · pick the pen to draw · drop a sticky note."

### C9. Data model
```
diagramType: "whiteboard"
whiteboard: {
  sketchStyle: bool,
  strokes:     [ { id, points:[{x,y}...], color, width, kind:"pen"|"highlighter" } ],
  stickyNotes: [ { id, x, y, w, h, text, color } ]
  // base shapes[], connectors[], text live in shared arrays;
  // any object may carry: hyperlink:{type:"url"|"diagram",target}, sketch:bool
}
```

### C10. Edge cases & glitches to avoid
- Simplify long stroke point-paths (JSON bloat).
- Stroke-level erase hit-tests the path, not bbox.
- Sticky-note text auto-contrast.
- Pen/eraser respect zoom (width in canvas units).
- Auto-save waits for stroke completion (debounce on pointer-up).
- Laser trail leaves no persistent data, never exported.

---

## PART D — Shared behavior
- **New-diagram popup:** activate all three types; selecting opens the editor in the matching mode module.
- **Save/share/viewer/export/print/Trash:** inherited unchanged. Thumbnails render from laid-out/freeform content.
- **Out of scope:** converting types; real-time multi-user collaboration.

---

## PART E — Build order (one feature per session)
Each step: read spec → plan → implement → write & run automated tests → self-review vs AC → verify v1 block editor still works → commit only when green.

**Mind Map**
- M1. Tree model + balanced auto-layout engine. AC: root centered; adding nodes positions via balanced layout; O(n); animates.
- M2. Keyboard creation & navigation. AC: full keyboard loop builds/navigates; delete parent removes subtree w/ confirm; promote/demote + reorder.
- M3. Curved branch connectors + branch coloring. AC: parent-child curves in branch colors, no arrowheads; recolor cascades.
- M4. Collapse/expand + drag re-parent/reorder. AC: collapse hides subtree + count badge; drag re-parents/reorders; cycles blocked.
- M5. Paste-to-tree + node markers + cross-links + notes. AC: paste indented text builds subtree; markers + notes persist; cross-links distinct + persist.
- M6. Outline view + focus mode + palette + empty state + fit-to-view. AC: outline two-way sync; focus dims; palette relevant tiles; empty root; fit frames tree.

**Flowchart**
- F1. Node-type set + designed defaults.
- F2. Extend-from-node creation (+ handles + type picker) + keyboard flow-building.
- F3. Decision branches with editable labels + auto-balance.
- F4. Orthogonal routing + arrowheads + manual move + drag-to-empty type prompt.
- F5. Tidy-up + node-type swap + insert-in-the-middle reflow + direction toggle.

**Whiteboard**
- W1. Free expanding canvas + double-click text + tool palette.
- W2. Vector pen + highlighter + thickness/color.
- W3. Stroke-level eraser.
- W4. Sticky notes (Tab-to-next, number-key colors).
- W5. Hand-drawn style toggle + laser pointer.
- W6. Hyperlinks + minimap + palette + empty state.

---

## PART G — Implementation guidance & pitfalls (BINDING)

### G1. One shared editor, mode strategies — never fork
One editor that loads a **mode strategy object** based on `diagramType`. The strategy declares: visible palette tools, active pointer/keyboard interactions, whether auto-layout runs, how the type renders to SVG. Canvas, selection, transform, persistence, export, print, share, viewer stay shared. Shared-code changes must be additive and behind the strategy interface, regression-tested across all four types.

### G2. Single source of truth + stable IDs
Whole diagram in one reactive store (the existing one). All edits via defined mutations. Stable unique IDs (e.g., nanoid) for every node/edge/stroke/object. Never identify by array index.

### G3. Backward compatibility
Existing v1 diagrams have **no `diagramType`** → default missing to `"block"` (DocType default + read-time fallback). Verify a pre-change block diagram still opens/edits. Handle in the foundation step before any new type.

### G4. One coordinate transform, used everywhere
Single screen↔canvas transform; route every new interaction through it (pen, laser, sticky, double-click-create, drag-to-empty, hit-test, alignment). Distances in canvas units. Test at 10%, 100%, 400% zoom and after panning.

### G5. Keyboard handling mode-aware + text-edit-guarded
Branch on active mode; ignore creation/navigation shortcuts when a text field has focus. Guard: arrows (nudge in block vs navigate in mindmap), Tab/Enter (preventDefault), letter keys (flowchart, only when node selected & not editing), number keys (whiteboard colors, not while editing), double-click empty (shape vs textbox), Delete/Backspace (route by mode).

### G6. Undo/redo on semantic model ops — layout derived
Push document mutations, never layout positions. Recompute layout after undo/redo. Tidy up, insert-reflow, paste-to-tree, delete-subtree each one undoable unit.

### G7. De-risk hard algorithms (simplest-correct first)
- Mind-map layout: first right-side-only non-overlapping (subtree extents bottom-up, positions top-down), tested; then balanced left/right.
- Flowchart positioning: per-node `manuallyPositioned` flag; auto-place/reflow only move non-manual + newly inserted; Tidy clears flags.
- Whiteboard strokes: simplify (RDP) on pointer-up; hit-test path geometry.

### G8. One render-to-SVG path
Each strategy renders to SVG; export/thumbnail/print/viewer reuse it. Frame content bbox (critical for auto-expanding canvases). Laser/grid never exported. Viewer = same path, tools disabled.

### G9. Dependencies & conventions
"No other UI kits" = UI/styling libs (stay frappe-ui + Espresso); low-level geometry/rendering helpers OK (ask first: what/why/size/alternative). Match existing conventions; verify APIs against installed frappe-ui + Espresso tokens.

### G10. Two-way sync (outline) must not loop
Outline + map are two projections of one model; edits dispatch mutations; both derive. Guard reactive cycles; debounce.

### G11. Performance
rAF-throttled animations/layout; no full re-render per keystroke; stable keys/memoization; 300+ nodes smooth; cull off-screen for very large.

### G12. Testing that catches bugs
Heavily unit-test pure logic (layout no-overlap, cycle prevention, paste parsing, reflow/insert/swap edge-preservation, stroke simplification, hit-testing, transforms). Sparse e2e for critical flows. No "renders" only tests. Regression-test v1 every step.

### G13. When to stop and ask
Ambiguity, conflicting requirements, would-change-v1 behavior, new dependency, missing frappe-ui/Espresso capability, or unmeetable AC → ask the product owner.

---
(Competitive analysis Part F omitted here; see original; not needed for build.)
