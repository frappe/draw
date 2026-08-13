// Shared whiteboard editor-UI state (spec diagram-types Part C). A module-level
// singleton — like useTextEditing — so the bottom-palette tools, the right
// palette, the keyboard handler, the interaction composable and the render layer
// all read/write ONE source for the active pen color/width, sticky color,
// selected whiteboard object, and the transient laser trail. None of this lives
// in the document store: it is chrome, not document data (the laser trail in
// particular is never persisted or exported, spec C5/C10/G8).

import { reactive, ref, readonly, shallowRef } from 'vue'
import { PEN_COLORS, PEN_WIDTHS, HIGHLIGHTER_WIDTHS, STICKY_COLORS, PEN_OPACITY, HIGHLIGHTER_OPACITY } from '@/diagram/whiteboardColors.js'
import { pruneTrail } from '@/diagram/laser.js'
import { ERASER_SIZES } from '@/diagram/eraser.js'

let singleton = null

// `store` is the document store, passed by EditorShell as each diagram loads (the
// same binding idiom useTextEditing and useMindmapNodeDrag use). It is how picking
// a sticky can drop the block-shape selection — see attachSelection. Every other
// caller passes nothing and shares whatever is bound. The singleton itself is NOT
// rebuilt on a new document: it carries the tool preferences (pen colour, eraser
// mode) that deliberately outlive one diagram, and reset() clears the rest.
export function useWhiteboardUi(store = null) {
  if (!singleton) singleton = createWhiteboardUi()
  if (store) singleton.documentStore = store
  return singleton
}

function createWhiteboardUi() {
  const state = reactive({
    penColor: PEN_COLORS[0],
    penWidth: PEN_WIDTHS[1],
    highlighterWidth: HIGHLIGHTER_WIDTHS[1],
    // The merged Draw tool's sub-mode (#242): 'pen' | 'highlighter', which ink the
    // next stroke commits as. `penOpacity`/`highlighterOpacity` are global
    // preferences, one per ink — applied uniformly to every stroke of that kind on
    // the canvas rather than stored per-stroke, see WhiteboardLayer.vue's
    // strokeOpacity().
    drawKind: 'pen',
    penOpacity: PEN_OPACITY,
    highlighterOpacity: HIGHLIGHTER_OPACITY,
    stickyColor: STICKY_COLORS[0],
    // Eraser (#39): 'ink' rubs out only what the tip covers, 'object' deletes the
    // whole element under it. `eraserSize` is the tip radius in canvas units.
    eraserMode: 'ink',
    eraserSize: ERASER_SIZES[1],
    // Default endpoint styles for new lines ('none' | 'arrow' | 'dot').
    lineStart: 'none',
    lineEnd: 'arrow',
    // Default grid size for new tables.
    tableRows: 3,
    tableCols: 3,
    // Multi-select source of truth: an array of { kind, id } (spec — standard
    // multi-select). `kind` is 'stroke'|'sticky'|'line'|'table'.
    selection: [],
    // Derived single selection: selection[0] when exactly one object is picked,
    // else null. All the existing single-object logic (options/rendering/drag)
    // reads this and is simply inactive during a multi-selection.
    selected: null,
    // The live rubber-band marquee box {x,y,w,h} in canvas units, or null.
    marquee: null,
    // The table cell being edited inline: { tableId, row, col } or null.
    editingCell: null,
    // A shift-click cell range for merge/split: { tableId, r0, c0, r1, c1 } or null.
    cellRange: null,
    // A sticky id that should open its inline editor (e.g. right after it's
    // created); the sticky component consumes and clears it.
    stickyEditRequest: null,
  })
  // Transient laser trail: timestamped points that fade out (never persisted).
  const laserTrail = ref([])
  // Animation clock for the trail: bumped once per frame while the trail lives,
  // so the render layer's opacities are recomputed even when no point expired.
  const laserClock = ref(0)
  // The stroke being drawn right now (pen/highlighter), rendered live by the
  // layer until pointer-up simplifies + commits it. Null when not drawing.
  const liveStroke = ref(null)
  // The line being dragged right now (preview), or null.
  const liveLine = ref(null)
  // The open table cell's contenteditable element (#344). It is published here
  // because the cell's B/I/U control cannot live inside WhiteboardTable: that
  // component's root is an SVG <g>, and Vue creates a <Teleport>'s content in the
  // parent's namespace — so an HTML toolbar built there comes out SVG-namespaced
  // and has no layout box at all. The control renders from the HTML tree
  // (floating/TableCellToolbar) and reads the live editor through this ref.
  // shallowRef: a DOM node must not be made deeply reactive.
  const cellEditor = shallowRef(null)
  // Which marks the open cell's current selection carries, per mark: true, false
  // or 'mixed'. Shared for the same reason: the editor (Cmd+B) and the toolbar
  // buttons are in different components, and a per-component copy would leave
  // the buttons showing stale state after a keyboard shortcut.
  const cellMarks = ref({})
  const api = {
    state,
    laserTrail: readonly(laserTrail),
    laserClock: readonly(laserClock),
    liveStroke,
    liveLine,
    cellEditor,
    cellMarks,
  }
  // Ask a sticky to open its inline editor (consumed + cleared by the component).
  api.requestStickyEdit = (id) => {
    state.stickyEditRequest = id
  }
  attachSelection(api, state)
  attachLaser(api, laserTrail, laserClock)

  // Clear the document-scoped transient state when a document loads or swaps in
  // place, KEEPING the tool preferences (pen colour/width, eraser mode, …). The
  // selection and editingCell are keyed by object ids that repeat across
  // documents, so a leftover would reattach to a same-id object in the next one
  // (and drop its editor chrome onto it). Mirrors resetMindmapUi / resetFlowchartUi.
  api.reset = () => {
    api.clearSelection() // selection + selected + editingCell
    api.clearLaser()
    state.marquee = null
    state.stickyEditRequest = null
    liveStroke.value = null
    liveLine.value = null
  }
  return api
}

function attachSelection(api, state) {
  const same = (a, b) => a.kind === b.kind && a.id === b.id

  // The one place selection is mutated: assign the array and re-derive `selected`
  // so every single-object call site keeps working (selected is null unless the
  // selection holds exactly one object). Route ALL mutations through here.
  //
  // `keepShapes` is for Select All, the one caller that legitimately wants both
  // kinds selected at once (Cmd+A → Delete has to clear the board as well as the
  // shapes). Everything else takes the selection over.
  const setSelection = (list, { keepShapes = false } = {}) => {
    state.selection = list
    state.selected = list.length === 1 ? list[0] : null
    // Any selection change (click away, marquee, select another object) closes an
    // open table-cell editor; the cell's watch flushes the pending draft on the
    // editingCell → null transition. The direct cell-to-cell switch does NOT route
    // through here (it sets editingCell straight), so this never cuts an edit short.
    state.editingCell = null
    // A whiteboard object and a block shape are never selected together (#416).
    // The canvas toolbar resolves its chrome from whichever selection is filled and
    // gives this one priority, so a sticky left selected here kept owning the bar
    // while the user edited a shape — and the colour they picked landed on the
    // sticky. See resolveChromeType in useSelectionContext.
    if (list.length && !keepShapes) api.documentStore?.clearSelection()
  }
  api.setSelection = setSelection

  api.selectStroke = (id) => setSelection([{ kind: 'stroke', id }])
  api.selectSticky = (id) => setSelection([{ kind: 'sticky', id }])
  api.selectLine = (id) => setSelection([{ kind: 'line', id }])
  api.selectTable = (id) => setSelection([{ kind: 'table', id }])
  api.clearSelection = () => setSelection([])

  api.isSelected = (kind, id) => state.selection.some((item) => item.kind === kind && item.id === id)

  // Additive click: add the object if absent, remove it if already selected.
  api.toggleSelected = (kind, id) => {
    const item = { kind, id }
    const next = state.selection.filter((existing) => !same(existing, item))
    if (next.length === state.selection.length) next.push(item)
    setSelection(next)
  }

  // Merge `items` into the selection, de-duped by kind+id (marquee additive add).
  api.addToSelection = (items) => {
    const next = [...state.selection]
    for (const item of items) if (!next.some((existing) => same(existing, item))) next.push(item)
    setSelection(next)
  }
}

// Laser points carry a birth timestamp; a rAF loop drops the expired ones and
// ticks `laserClock` so the render layer re-computes opacities every frame — the
// trail keeps fading after the pointer stops (spec C5 self-fading trail, #41).
function attachLaser(api, laserTrail, laserClock) {
  let raf = null
  api.pushLaserPoint = (point) => {
    const at = performance.now()
    // Accumulate: the pointer leaves a short trail of timestamped points behind
    // it, each fading out on its own. Old points are dropped here as well as in
    // the loop so a fast drag can never grow the trail past the fade window.
    laserTrail.value = [...pruneTrail(laserTrail.value, at), { x: point.x, y: point.y, at }]
    laserClock.value = at
    schedulePrune()
  }
  // Move the dot without leaving a trail behind it (armed but not drawing, #253):
  // replaces the trail rather than accumulating, so trailSegments() has only one
  // point to work with and renders nothing.
  api.setLaserDot = (point) => {
    const at = performance.now()
    laserTrail.value = [{ x: point.x, y: point.y, at }]
    laserClock.value = at
    schedulePrune()
  }
  api.clearLaser = () => {
    laserTrail.value = []
    if (raf) cancelAnimationFrame(raf)
    raf = null
  }
  function schedulePrune() {
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = null
      const now = performance.now()
      const next = pruneTrail(laserTrail.value, now)
      if (next.length !== laserTrail.value.length) laserTrail.value = next
      laserClock.value = now
      if (next.length) schedulePrune()
    })
  }
}
