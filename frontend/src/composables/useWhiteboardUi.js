// Shared whiteboard editor-UI state (spec diagram-types Part C). A module-level
// singleton — like useTextEditing — so the bottom-palette tools, the right
// palette, the keyboard handler, the interaction composable and the render layer
// all read/write ONE source for the active pen color/width, sticky color,
// selected whiteboard object, and the transient laser trail. None of this lives
// in the document store: it is chrome, not document data (the laser trail in
// particular is never persisted or exported, spec C5/C10/G8).

import { reactive, ref, readonly } from 'vue'
import { PEN_COLORS, PEN_WIDTHS, STICKY_COLORS } from '@/diagram/whiteboardColors.js'

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
  })
  // Transient laser trail: timestamped points that fade out (never persisted).
  const laserTrail = ref([])
  // The stroke being drawn right now (pen/highlighter), rendered live by the
  // layer until pointer-up simplifies + commits it. Null when not drawing.
  const liveStroke = ref(null)
  // The line being dragged right now (preview), or null.
  const liveLine = ref(null)
  const api = { state, laserTrail: readonly(laserTrail), liveStroke, liveLine }
  attachSelection(api, state)
  attachLaser(api, laserTrail)
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

// Laser points carry a birth timestamp; the render layer culls anything older
// than LASER_FADE_MS and a rAF loop keeps the trail shrinking after the pointer
// stops (spec C5 self-fading trail).
const LASER_FADE_MS = 650

function attachLaser(api, laserTrail) {
  let raf = null
  api.pushLaserPoint = (point) => {
    // A single dot that follows the pointer — no fading trail (S8). Keep only the
    // latest point; the prune loop clears it shortly after the pointer stops.
    laserTrail.value = [{ ...point, at: performance.now() }]
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
      const next = prune(laserTrail.value)
      if (next.length !== laserTrail.value.length) laserTrail.value = next
      if (next.length) schedulePrune()
    })
  }
}

function prune(points) {
  const cutoff = performance.now() - LASER_FADE_MS
  return points.filter((point) => point.at >= cutoff)
}

export { LASER_FADE_MS }
