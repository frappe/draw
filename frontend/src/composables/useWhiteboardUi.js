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
    // The selected whiteboard object: { kind:'stroke'|'sticky'|'line'|'table', id }.
    selected: null,
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
  api.selectStroke = (id) => (state.selected = { kind: 'stroke', id })
  api.selectSticky = (id) => (state.selected = { kind: 'sticky', id })
  api.selectLine = (id) => (state.selected = { kind: 'line', id })
  api.selectTable = (id) => (state.selected = { kind: 'table', id })
  api.clearSelection = () => (state.selected = null)
}

// Laser points carry a birth timestamp; the render layer culls anything older
// than LASER_FADE_MS and a rAF loop keeps the trail shrinking after the pointer
// stops (spec C5 self-fading trail).
const LASER_FADE_MS = 650

function attachLaser(api, laserTrail) {
  let raf = null
  api.pushLaserPoint = (point) => {
    laserTrail.value = [...prune(laserTrail.value), { ...point, at: performance.now() }]
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
