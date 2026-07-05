// Shape + connector creation for the canvas (spec §7.1, §4.2). Supports two
// flows that both end in store.addShape / store.addConnector:
//   1. Click-to-draw: arm a tool in the left palette, then press-drag-release on
//      the canvas to size the new shape (a default size if it was just a click).
//   2. Drag-and-drop: drag a palette tile onto the canvas; the drop point becomes
//      the new element's centre.
// Both read the armed type from editorUi (state.tool === 'draw' + drawShapeType).
// Connectors are drawn as a straight press-drag-release segment of the armed type.
//
// Integration: attach the returned handlers to the canvas surface element
// (DiagramCanvas owns it). This composable is element-agnostic and derives
// logical coordinates from event.currentTarget + the viewport transform. The
// store fills the designed default style via its factories, so every spawned
// shape is beautiful by default (spec §5.1). Render `preview` as a dashed ghost
// for a live size hint if desired.

import { ref } from 'vue'
import { useTextEditing } from '@/composables/useTextEditing.js'
import { useEdgeAutoPan } from '@/composables/useEdgeAutoPan.js'

const DATA_TRANSFER_KEY = 'application/x-frappe-draw-tool'

// Connector draw tools → geometry + default endpoints. 'line' is a plain
// straight segment with no arrowheads; 'arrow' adds an end arrow. elbow/curved
// keep the end arrow. The user changes endpoints afterwards in the right palette.
const CONNECTOR_SPECS = {
  line: { type: 'straight', arrowheads: { start: 'none', end: 'none' } },
  arrow: { type: 'straight', arrowheads: { start: 'none', end: 'arrow' } },
  straight: { type: 'straight', arrowheads: { start: 'none', end: 'arrow' } },
  elbow: { type: 'elbow', arrowheads: { start: 'none', end: 'arrow' } },
  curved: { type: 'curved', arrowheads: { start: 'none', end: 'arrow' } },
}
const CONNECTOR_TYPES = Object.keys(CONNECTOR_SPECS)
const DEFAULT_SIZE = { w: 180, h: 96 }
const MIN_SIZE = 24

export function useShapeCreation(store, editorUi) {
  const preview = ref(null)
  const drag = { active: false, start: { x: 0, y: 0 } }
  const edgePan = useEdgeAutoPan(editorUi.viewport)

  function logicalPoint(event) {
    return toLogicalPoint(event, editorUi.viewport.state)
  }
  // Client coords → logical, for the auto-pan step (which only has x/y, not an
  // event); folds in scroll like toLogicalPoint (scroll is 0 with the infinite
  // canvas, but this stays correct if that ever changes).
  function logicalXY(el, x, y) {
    const b = el.getBoundingClientRect()
    const { panX, panY, zoom } = editorUi.viewport.state
    return { x: (x - b.left + el.scrollLeft - panX) / zoom, y: (y - b.top + el.scrollTop - panY) / zoom }
  }

  function onCanvasPointerDown(event) {
    if (editorUi.state.tool !== 'draw' || event.button !== 0) return
    beginDraft(drag, preview, logicalPoint(event))
    event.currentTarget.setPointerCapture?.(event.pointerId)
    // As the drag reaches an edge, auto-pan and re-size the draft to the pointer.
    const surface = event.currentTarget
    edgePan.begin(surface, (x, y) =>
      updateDraft(drag, preview, editorUi.state.drawShapeType, logicalXY(surface, x, y)),
    )
  }

  function onCanvasPointerMove(event) {
    if (!drag.active) return
    updateDraft(drag, preview, editorUi.state.drawShapeType, logicalPoint(event))
    edgePan.track(event.clientX, event.clientY)
  }

  function onCanvasPointerUp(event) {
    edgePan.stop()
    if (!drag.active) return
    finishDraft(drag, preview, store, editorUi, logicalPoint(event))
  }

  function onCanvasDragOver(event) {
    if (hasToolPayload(event)) event.preventDefault()
  }

  function onCanvasDrop(event) {
    const type = readToolPayload(event)
    if (!type) return
    event.preventDefault()
    dropAt(store, editorUi, type, logicalPoint(event))
  }

  return {
    preview,
    onCanvasPointerDown,
    onCanvasPointerMove,
    onCanvasPointerUp,
    onCanvasDragOver,
    onCanvasDrop,
  }
}

export function isConnectorType(type) {
  return CONNECTOR_TYPES.includes(type)
}

// Convert a pointer event to logical canvas units by undoing the SVG <g> pan +
// zoom transform applied by DiagramCanvas (translate(panX panY) scale(zoom)).
// The SVG lives inside the surface's own scroll box, so its content shifts by
// the surface's scrollLeft/scrollTop too — fold that in, or a shape drawn on a
// scrolled (panned) canvas lands offset from the pointer.
function toLogicalPoint(event, viewport) {
  const el = event.currentTarget
  const bounds = el.getBoundingClientRect()
  return {
    x: (event.clientX - bounds.left + el.scrollLeft - viewport.panX) / viewport.zoom,
    y: (event.clientY - bounds.top + el.scrollTop - viewport.panY) / viewport.zoom,
  }
}

function beginDraft(drag, preview, point) {
  drag.active = true
  drag.start = point
  preview.value = { box: true, x: point.x, y: point.y, w: 0, h: 0 }
}

function updateDraft(drag, preview, type, point) {
  preview.value = isConnectorType(type)
    ? { line: true, x1: drag.start.x, y1: drag.start.y, x2: point.x, y2: point.y }
    : { box: true, ...boxBetween(drag.start, point) }
}

// A normalised rectangle spanning the two pointer corners.
function boxBetween(start, end) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    w: Math.abs(end.x - start.x),
    h: Math.abs(end.y - start.y),
  }
}

function finishDraft(drag, preview, store, editorUi, end) {
  const type = editorUi.state.drawShapeType
  if (isConnectorType(type)) commitConnector(store, type, drag.start, end)
  else commitShape(store, type, drag.start, end)
  drag.active = false
  preview.value = null
  editorUi.setTool('select')
}

// A bare click (no real drag) yields a default-sized shape centred on the click.
// A text box opens straight into edit mode so the caret is ready to type.
function commitShape(store, type, start, end) {
  const box = boxBetween(start, end)
  const sized = box.w < MIN_SIZE || box.h < MIN_SIZE ? centeredDefaultBox(start) : box
  const id = store.addShape({ type, ...sized })
  store.select(id)
  if (type === 'text') useTextEditing().beginTextEdit(id)
}

function commitConnector(store, drawType, start, end) {
  const spec = CONNECTOR_SPECS[drawType] || CONNECTOR_SPECS.straight
  store.select(
    store.addConnector({ type: spec.type, arrowheads: { ...spec.arrowheads }, from: { ...start }, to: { ...end } }),
  )
}

function centeredDefaultBox(point) {
  const { w, h } = DEFAULT_SIZE
  return { x: point.x - w / 2, y: point.y - h / 2, w, h }
}

// Drop-to-create: centre a default element on the drop point so a quick drag
// still yields a usable element.
function dropAt(store, editorUi, type, point) {
  if (isConnectorType(type)) {
    const half = DEFAULT_SIZE.w / 2
    commitConnector(store, type, { x: point.x - half, y: point.y }, { x: point.x + half, y: point.y })
  } else {
    const id = store.addShape({ type, ...centeredDefaultBox(point) })
    store.select(id)
    if (type === 'text') useTextEditing().beginTextEdit(id)
  }
  editorUi.setTool('select')
}

// Palette tiles call this on dragstart to carry the chosen tool type and arm
// draw mode, so a drop, a pointer-draw, and the active highlight all agree.
export function startPaletteDrag(event, type, editorUi) {
  editorUi.setDrawShape(type)
  event.dataTransfer?.setData(DATA_TRANSFER_KEY, type)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}

function hasToolPayload(event) {
  return Array.from(event.dataTransfer?.types || []).includes(DATA_TRANSFER_KEY)
}

function readToolPayload(event) {
  return event.dataTransfer?.getData(DATA_TRANSFER_KEY) || null
}
