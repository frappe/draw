// Shared whiteboard editor-UI state (spec diagram-types Part C). A module-level
// singleton — like useTextEditing — so the bottom-palette tools, the right
// palette, the keyboard handler, the interaction composable and the render layer
// all read/write ONE source for the active pen color/width, sticky color,
// selected whiteboard object, and the transient laser trail. None of this lives
// in the document store: it is chrome, not document data (the laser trail in
// particular is never persisted or exported, spec C5/C10/G8).

import { reactive, ref, readonly } from 'vue'
import { PEN_COLORS, PEN_WIDTHS, STICKY_COLORS } from '@/diagram/whiteboardColors.js'
import { pruneTrail } from '@/diagram/laser.js'
import { ERASER_SIZES } from '@/diagram/eraser.js'

let singleton = null

export function useWhiteboardUi() {
  if (!singleton) singleton = createWhiteboardUi()
  return singleton
}

function createWhiteboardUi() {
  const state = reactive({
    penColor: PEN_COLORS[0],
    penWidth: PEN_WIDTHS[1],
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
  const api = {
    state,
    laserTrail: readonly(laserTrail),
    laserClock: readonly(laserClock),
    liveStroke,
    liveLine,
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
  const setSelection = (list) => {
    state.selection = list
    state.selected = list.length === 1 ? list[0] : null
    // Any selection change (click away, marquee, select another object) closes an
    // open table-cell editor; the cell's watch flushes the pending draft on the
    // editingCell → null transition. The direct cell-to-cell switch does NOT route
    // through here (it sets editingCell straight), so this never cuts an edit short.
    state.editingCell = null
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
