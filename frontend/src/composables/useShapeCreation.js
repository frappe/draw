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
import { CONNECTOR_SPECS, CONNECTOR_TYPES, FALLBACK_CONNECTOR } from '@/diagram/connectorSpecs.js'

export const DATA_TRANSFER_KEY = 'application/x-frappe-draw-tool'

// Connector specs (which armed types are connectors + their arrowheads) live in a
// shared module so the snap-to-anchor draw path agrees on the full set (#138).
const DEFAULT_SIZE = { w: 180, h: 96 }
const MIN_SIZE = 24

export function useShapeCreation(store, editorUi) {
  const preview = ref(null)
  const drag = { active: false, start: { x: 0, y: 0 }, square: false }
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
    beginDraft(drag, preview, editorUi.state.drawShapeType, logicalPoint(event))
    event.currentTarget.setPointerCapture?.(event.pointerId)
    // As the drag reaches an edge, auto-pan and re-size the draft to the pointer.
    const surface = event.currentTarget
    edgePan.begin(surface, (x, y) =>
      updateDraft(drag, preview, editorUi.state.drawShapeType, logicalXY(surface, x, y)),
    )
  }

  function onCanvasPointerMove(event) {
    if (!drag.active) return
    drag.square = event.shiftKey
    updateDraft(drag, preview, editorUi.state.drawShapeType, logicalPoint(event))
    edgePan.track(event.clientX, event.clientY)
  }

  function onCanvasPointerUp(event) {
    edgePan.stop()
    if (!drag.active) return
    drag.square = event.shiftKey
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

  // Click-to-place for a catalog-armed mind-map / flowchart starter (#75). A mind
  // map / flowchart isn't a shape draw-type, so it has its own armed state
  // (editorUi.pendingStarter) and its own drop path here alongside the shape flows:
  // a plain click (no drag needed) drops the starter's first node CENTRED on the
  // click point, then disarms back to select — the arm-then-click model shape tools
  // use. Returns true when it consumed the press so the canvas skips select handling.
  function placeArmedStarter(event) {
    const starter = editorUi.state.pendingStarter
    if (!starter || event.button !== 0) return false
    const point = logicalPoint(event)
    if (starter.kind === 'mindmap') store.insertMindmapStarter(null, point)
    else if (starter.kind === 'flowchart') store.insertFlowchartStarter(null, starter.nodeType, point)
    // A picked image is already uploaded and measured by the time it is armed, so
    // the click only has to say where (#503). One click, no drag to size — the
    // width is capped for us, and there is nothing else to decide.
    else if (starter.kind === 'image') store.insertImage(starter.image, point)
    editorUi.setTool('select')
    // A dropped mind-map root drops you straight into typing (#263): the insert
    // selected it, so edit it with "New idea" pre-selected — the first keystroke
    // replaces it; Escape / clicking away keeps it.
    if (starter.kind === 'mindmap') {
      const rootId = store.state.selection[0]
      // Bind the editing singleton to this store (a no-op in the app, where it is
      // already bound) so the drop works outside a mounted editor too.
      if (rootId) useTextEditing(store, editorUi).beginTextEdit(rootId, { selectAll: true, seedIfEmpty: 'New idea' })
    }
    // A placed flowchart starter gets the same drop-to-type treatment (#410): the
    // insert already gave it a default label ("Start", "Process", …), so pre-select
    // that and the first keystroke replaces it. This is also what closes off the
    // flowchart build shortcuts as a footgun — Enter/D/T/I own the keyboard while a
    // node is selected, so typing a label used to chain unwanted nodes instead.
    if (starter.kind === 'flowchart') {
      const nodeId = store.state.selection[0]
      if (nodeId) useTextEditing(store, editorUi).beginTextEdit(nodeId, { selectAll: true })
    }
    return true
  }

  return {
    preview,
    onCanvasPointerDown,
    onCanvasPointerMove,
    onCanvasPointerUp,
    onCanvasDragOver,
    onCanvasDrop,
    placeArmedStarter,
  }
}

export function isConnectorType(type) {
  return CONNECTOR_TYPES.includes(type)
}

// The dashed draw ghost, as a throwaway shape so the canvas can render it through
// ShapeView and the preview matches the committed shape exactly (#130): a
// rectangle previews with rectangle corners (not the rounded rect's), an ellipse
// previews as the inscribed ellipse of the drag bounds — so the pointer sits on
// the bounding box, matching Figma / Excalidraw. Returns null for the connector
// (line) draft and before the first move, so only box drafts ghost as a shape.
// Text / image carry no outline of their own, so they preview as a plain box.
export function draftPreviewShape(draft) {
  if (!draft?.box) return null
  const type = draft.type === 'text' || draft.type === 'image' ? 'rectangle' : draft.type
  return {
    type: type || 'rectangle',
    x: draft.x,
    y: draft.y,
    w: draft.w,
    h: draft.h,
    rotation: 0,
    opacity: 1,
    fill: 'none',
    border: { color: '#006EDB', width: 1.5, dash: 'dashed' },
  }
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

// The zero-size draft comes from updateDraft too, so a connector tool never
// starts out as a box ghost before the first pointer move.
function beginDraft(drag, preview, type, point) {
  drag.active = true
  drag.start = point
  updateDraft(drag, preview, type, point)
}

// The draft carries the armed shape type so the canvas can ghost the actual
// shape (ellipse, diamond, star…) instead of a generic rectangle.
function updateDraft(drag, preview, type, point) {
  preview.value = isConnectorType(type)
    ? { line: true, x1: drag.start.x, y1: drag.start.y, x2: point.x, y2: point.y }
    : { box: true, type, ...boxBetween(drag.start, point, drag.square) }
}

// A normalised rectangle spanning the two pointer corners. With `square` (Shift
// held while drawing), the sides are locked equal — side = max(|dx|, |dy|) —
// anchored at the start corner and grown in the drag direction, so a rectangle
// draws a square and an ellipse a circle. Connectors never pass square, so a
// held Shift leaves lines free to point anywhere.
function boxBetween(start, end, square = false) {
  let ex = end.x
  let ey = end.y
  if (square) {
    const side = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y))
    ex = start.x + (end.x < start.x ? -side : side)
    ey = start.y + (end.y < start.y ? -side : side)
  }
  return {
    x: Math.min(start.x, ex),
    y: Math.min(start.y, ey),
    w: Math.abs(ex - start.x),
    h: Math.abs(ey - start.y),
  }
}

function finishDraft(drag, preview, store, editorUi, end) {
  const type = editorUi.state.drawShapeType
  if (isConnectorType(type)) commitConnector(store, type, drag.start, end)
  else commitShape(store, type, drag.start, end, drag.square)
  drag.active = false
  preview.value = null
  editorUi.setTool('select')
}

// A bare click (no real drag) yields a default-sized shape centred on the click.
// A text box opens straight into edit mode so the caret is ready to type.
function commitShape(store, type, start, end, square) {
  const box = boxBetween(start, end, square)
  const sized = box.w < MIN_SIZE || box.h < MIN_SIZE ? centeredDefaultBox(start) : box
  const id = store.addShape({ type, ...sized })
  store.select(id)
  if (type === 'text') useTextEditing().beginTextEdit(id)
}

function commitConnector(store, drawType, start, end) {
  const spec = CONNECTOR_SPECS[drawType] || FALLBACK_CONNECTOR
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

// Palette tiles call this on dragstart to carry the chosen tool type and arm draw
// mode, so a drop, a pointer-draw, and the active highlight all agree. The payload
// key must stay in sync with readToolPayload below — it is exported so a test can
// pin that contract, since a mismatch silently makes the whole gesture a no-op.
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
