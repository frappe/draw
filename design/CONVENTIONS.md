# Frappe Draw — Engineering Conventions (the shared contract)

Every agent building this app MUST read this file and follow it exactly. It is the
contract that lets independently-built features integrate. Also read:
- `design/SPEC.md` — product spec (the *what* + data model + build order)
- `design/README.md` — visual/interaction handoff (the *how it looks*, pixel-level)
- `design/colors_and_type.css` — Espresso token VALUES (reference only — do NOT import)
- `design/taste.md` — code-quality rules (follow them)

## Cardinal rules (non-negotiable)
1. **Build chrome with frappe-ui.** Use frappe-ui Vue components (`Button`, `Dialog`,
   `TextInput`, `Tooltip`, `Dropdown`, `FeatherIcon`/`LucideIcon`, etc.) and frappe-ui's
   Tailwind token classes (`bg-surface-white`, `text-ink-gray-9`, `border-outline-gray-1`,
   `bg-surface-gray-2`, …). These come from `frappe-ui/tailwind` and map 1:1 to the
   `--es-*` values in colors_and_type.css. **Never** import colors_and_type.css and
   **never** hand-roll `es-btn`/inline-style chrome like the prototype did.
2. **The canvas is the exception.** SVG shapes/connectors/paper use literal colors and the
   per-canvas `--t*` theme-preset CSS variables (see theme.js), NOT chrome tokens. The
   canvas stays light in dark mode.
3. **Follow taste.md:** clean OOP-ish modules, functions ~10 lines, files 100–300 lines,
   <15 files per folder, no abbreviations, reuse first, write tests, minimum-working then iterate.
4. **Dark mode = chrome only** (`data-theme="dark"` on app root). Canvas never changes.
5. **Right palette = the GRID layout only.** Ignore the prototype's List/Compact variants
   and its bottom-left "Prototype review" panel — they are NOT product.
6. **Brand violet `#6846E3`** only for the logomark + avatar. Chrome stays neutral gray.

## App / paths
- App root: `apps/draw/draw/` (Python module "Frappe Draw")
- Frontend SPA: `apps/draw/frontend/` (Vue 3 + frappe-ui + Vite + Tailwind)
- DocTypes already exist: `Draw Diagram`, `Draw Folder` (see SPEC §11.3). Fields on Draw
  Diagram: title, description, folder (Link), canvas_size (Select), document (JSON),
  is_public (Check), revision (Int), is_trashed (Check), trashed_on (Datetime),
  thumbnail (Attach Image), sort_order (Int). Diagram name is a hash (permanent URL id).
- SPA served at route `/draw`; router base `/draw`; routes use names
  `Home` (`/`) and `Editor` (`/d/:name`).
- Build: `cd apps/draw/frontend && yarn build`. Dev: `yarn dev`. Bench runs via
  `bench start` (already running); site is `test.localhost`.

## Frontend file layout (create files ONLY in your assigned area)
```
frontend/src/
  main.js                      # bootstrap (frappeui.js imported FIRST)
  frappeui.js                  # setConfig('resourceFetcher', frappeRequest)
  App.vue                      # data-theme root + <router-view>
  router.js                    # routes
  diagram/                     # PURE diagram domain (no Vue): the model
    schema.js                  # SCHEMA_VERSION, createDiagramDocument(), parseDiagramDocument()  [EXISTS]
    canvasPresets.js           # CANVAS_PRESETS, findPreset()                                       [EXISTS]
    factories.js               # createShape(), createConnector() — default styles from active theme
    geometry.js                # bounding boxes, anchor points, rotation math, hit helpers
    theme.js                   # THEME_PRESETS (ocean/slate/violet/sunset) + --t* var maps
  stores/
    useDiagramStore.js         # THE document store (state + mutations + history). See API below.
    useEditorUi.js             # editor UI state: tool, drawShapeType, grid, zoom/pan(viewport), painter
  composables/
    useViewport.js             # pan/zoom (EXISTS — may extend)
    useKeyboard.js             # global shortcuts -> store actions
    useClipboard.js            # internal copy/cut/paste
    useAutosave.js             # debounced save + revision check + Saved/Saving state
    useSmartGuides.js          # alignment guides + snapping during drag
    useExport.js               # PNG/JPEG/SVG/PDF client-side
    useThumbnail.js            # throttled SVG->raster thumbnail on save
  components/
    canvas/                    # DiagramCanvas, ShapeView, ConnectorView, SelectionLayer,
                               # HoverArrows, SmartGuidesLayer, GridLayer, TextEditor, Rulers
    toolbar/                   # TopToolbar, TitleEditor, SaveIndicator, ExportMenu, ShareMenu
    palette-left/             # LeftPalette + shape/connector tool buttons + search
    palette-right/            # RightPalette + one Section component per spec §4.3 group
    floating/                 # BottomPalette (pointer modes, grid toggle, zoom controls)
    home/                     # Sidebar, TileGrid, DiagramTile, NewDiagramDialog, TrashView, FolderSection
  data/
    diagrams.js                # Draw Diagram resources (EXISTS — extend)
    folders.js                 # Draw Folder resources
  pages/
    HomeShell.vue              # composes home/*
    EditorShell.vue            # composes toolbar + palettes + canvas; owns the store instance
```

## useDiagramStore.js — THE store API (implement EXACTLY; features depend on it)
`createDiagramStore(initialDocument)` returns a reactive object. The store is created once
in EditorShell and provided via `provide('diagramStore', store)`; child components get it
with `inject('diagramStore')`. Helper `useDiagramStore()` does the inject.

State (reactive):
- `canvas`: `{ sizePreset, width, height, background }`
- `shapes`: array of Shape (render in zIndex order)
- `connectors`: array of Connector
- `selection`: array of selected ids (shape or connector)
- `themePreset`: 'ocean' | 'slate' | 'violet' | 'sunset'

Shape: `{ id, type:'rectangle'|'ellipse'|'square'|'triangle'|'diamond'|'text', x, y, w, h,
rotation, fill, border:{color,width,dash}, opacity, text:{content,align,valign,style:{size,bold,italic,underline,color}}, zIndex }`
Connector: `{ id, type:'straight'|'curved'|'elbow', from:{shapeId,anchor}|{x,y}, to:{shapeId,anchor}|{x,y},
arrowheads:{start:bool,end:bool}, style:{color,width,dash}, label, midpoint? }`
Anchor names: `'top'|'right'|'bottom'|'left'|'top-left'|'top-right'|'bottom-left'|'bottom-right'`.

Methods (all shape/connector mutations are history-tracked via commit()):
- `addShape(partial) -> id` (fills id, zIndex=max+1, default style from active theme via factories)
- `updateShape(id, patch)` ; `updateShapes(ids, patch)`
- `removeSelectionOrIds(ids?)` ; `removeShapes(ids)` ; `removeConnectors(ids)`
- `addConnector(partial) -> id` ; `updateConnector(id, patch)`
- `duplicate(ids) -> newIds` (offset +10/+10; connectors keep attachment only if both endpoints copied)
- `select(ids)` ; `toggleInSelection(id)` ; `addToSelection(ids)` ; `clearSelection()` ; `selectAll()`
- `bringToFront(ids)` ; `bringForward(ids)` ; `sendBackward(ids)` ; `sendToBack(ids)`
- `group(ids)` / `ungroup(ids)` (single-level; store a `groupId` on shapes)
- `applyTheme(presetName)` (sets themePreset; restyles shapes that use theme triads)
- `setCanvas(patch)` (size preset / background)
- `getDocument() -> plain JSON` matching schema.js (for persistence)
- `loadDocument(doc)` (replace state from a parsed document)
- History: `commit(label, mutatorFn)` wraps a mutation + pushes prior snapshot; `undo()`;
  `redo()`; max 50 steps; snapshot = deep clone of {canvas,shapes,connectors}. Selection
  is not part of history. Expose `canUndo`, `canRedo`.

useEditorUi.js (provide/inject 'editorUi'): `{ tool:'select'|'hand'|'draw', drawShapeType,
lastShapeType, gridVisible, gridDensity:'dense'|'sparse', formatPainter:{active,style},
viewport (from useViewport), zoomPercent, fit(), reset100() }`.

## Canvas rendering contract
- One `<svg viewBox="0 0 width height">` inside a wrapper carrying the `--t*` theme vars
  (data attribute `data-fdpreset`). All geometry in logical units (default 1280×720).
- Layer order (bottom→top): GridLayer, ConnectorView*, ShapeView*, SmartGuidesLayer,
  HoverArrows, SelectionLayer, TextEditor overlay.
- Pan area bg `#EEEEF0`; paper white with 1px `#E2E2E2` border + soft shadow; grid dots `#DCDCDF`.
- Canvas opens **fit-to-view and centered** with a small margin (NOT raw 100% top-left).
- Selection handles: 8 square handles + rotation handle, blue `#006EDB`. Hover-arrows: 4
  blue circles at mid-edges. Smart guides: pink `#E34AA6` dashed + snap. (Details in README.)

## Integration protocol (CRITICAL — avoids file conflicts between parallel agents)
- Foundation phase creates: schema/canvasPresets (exist), factories, geometry, theme, the
  store, useEditorUi, the canvas render pipeline, EditorShell + HomeShell skeletons, router,
  and frappeui.js. It DEFINES the slots where features mount.
- Feature agents create ONLY new files in their assigned folder. They must NOT edit
  EditorShell.vue, HomeShell.vue, router.js, or the store. Instead each returns precise
  **integration notes**: which component to import and where to mount, any store methods it
  expects (must already be in the API above), and any new route.
- The Integration phase wires everything into EditorShell/HomeShell/router/palette containers
  and makes `yarn build` pass.

## Backend
- Whitelisted API methods live in `draw/api/` (e.g., `diagram.py`) with
  `@frappe.whitelist()`. Guest read-only access for `is_public` diagrams via a guarded
  method. Trash auto-purge after 30 days = a scheduled job in hooks.py `scheduler_events`.
- Permissions: owner-based. Add a role the SPA users have; use `if_owner` where appropriate;
  System Manager full. Public diagrams readable by Guest only when `is_public`.

## Testing
- Python: `bench --site test.localhost run-tests --app draw`.
- Keep diagram-domain logic (geometry, store mutations, schema) in pure JS modules so they
  are unit-testable without a browser.
