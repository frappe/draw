// Whiteboard surface interaction (spec diagram-types Part C, steps W1-W6). Wires
// the bottom-palette tools (pen/highlighter/eraser/text/sticky/laser + select)
// to the shared surface-interaction seam (Part G1/G4). Every handler receives a
// `point` already in canvas units from the shared viewport transform, so pen
// width, hit-tests and placement are correct at any zoom (Part G4/C10).
//
// Drawing accumulates raw points on pointermove; on pointer-up the path is
// simplified with RDP (diagram/strokeSimplify.js, Part G7) BEFORE it reaches the
// store, so autosave (debounced on the document) only sees a completed, compact
// stroke (spec W2/C10). Each store mutation is one undoable unit (Part G6).

import { onBeforeUnmount } from 'vue'
import { HANDWRITTEN_FONT } from '@/composables/useTextEditing.js'
import { registerModeInteraction, useModeInteraction } from '@/composables/useModeInteraction.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { simplifyStroke } from '@/diagram/strokeSimplify.js'
import { strokeAt } from '@/diagram/whiteboardModel.js'
import { HIGHLIGHTER_WIDTH } from '@/diagram/whiteboardColors.js'

const ERASER_TOLERANCE = 6 // canvas units of slack around a stroke path

export function useWhiteboardInteraction(store, editorUi) {
  const ui = useWhiteboardUi()
  const interactionRef = useModeInteraction()
  const drawing = { active: false, points: [] }
  const erasing = { active: false }

  const handlers = {
    onPointerDown: (event, context) => onPointerDown(event, context, store, editorUi, ui, drawing, erasing),
    onPointerMove: (event, context) => onPointerMove(event, context, ui, drawing, erasing, store),
    onPointerUp: (event, context) => onPointerUp(event, context, store, ui, drawing, erasing),
    onDoubleClick: (event, context) => onDoubleClick(context, store),
  }
  registerModeInteraction(interactionRef, handlers)
  onBeforeUnmount(() => registerModeInteraction(interactionRef, null))

  return { ui }
}

function onPointerDown(event, context, store, editorUi, ui, drawing, erasing) {
  if (event.button !== 0) return
  const tool = editorUi.state.tool
  if (tool === 'pen' || tool === 'highlighter') return beginStroke(context, ui, drawing, tool)
  if (tool === 'eraser') return beginErase(context, store, erasing)
  if (tool === 'laser') return ui.pushLaserPoint(context.point)
  if (tool === 'sticky') return placeSticky(context, store, ui)
  if (tool === 'select') return selectAt(context, store, ui)
}

// Start capturing a freehand stroke; the live preview renders from ui.liveStroke.
function beginStroke(context, ui, drawing, tool) {
  drawing.active = true
  drawing.points = [context.point]
  const width = tool === 'highlighter' ? HIGHLIGHTER_WIDTH : ui.state.penWidth
  ui.liveStroke.value = { points: drawing.points, color: ui.state.penColor, width, kind: tool }
}

function beginErase(context, store, erasing) {
  erasing.active = true
  eraseAt(context.point, store)
}

function onPointerMove(event, context, ui, drawing, erasing, store) {
  if (drawing.active) {
    drawing.points.push(context.point)
    // Re-assign so the live preview re-renders (a pushed array isn't reactive).
    ui.liveStroke.value = { ...ui.liveStroke.value, points: [...drawing.points] }
    return
  }
  if (erasing.active) return eraseAt(context.point, store)
  if (context.editorUi.state.tool === 'laser') return ui.pushLaserPoint(context.point)
}

function onPointerUp(event, context, store, ui, drawing, erasing) {
  if (drawing.active) return finishStroke(ui, drawing, store)
  if (erasing.active) erasing.active = false
}

// Simplify (RDP) then commit so autosave only sees the compact final path
// (spec W2/C10/G7). Discard a degenerate (single-point) stroke.
function finishStroke(ui, drawing, store) {
  drawing.active = false
  const live = ui.liveStroke.value
  ui.liveStroke.value = null
  const simplified = simplifyStroke(drawing.points)
  drawing.points = []
  if (!live || simplified.length < 2) return
  store.addStroke(simplified, { color: live.color, width: live.width, kind: live.kind })
}

// Erase whole strokes whose path geometry (not bbox) is under the cursor
// (spec W3/C10). One removal = one undoable unit.
function eraseAt(point, store) {
  const hit = strokeAt(store.state.whiteboard, point, ERASER_TOLERANCE)
  if (hit) store.removeStroke(hit.id)
}

// Drop a sticky note centered on the click (spec W4); enter edit by selecting it.
function placeSticky(context, store, ui) {
  const half = 90
  const id = store.addStickyNote(context.point.x - half, context.point.y - half, {
    color: ui.state.stickyColor,
  })
  ui.selectSticky(id)
}

// Select tool: pick the stroke under the cursor (sticky selection is handled by
// the sticky's own pointerdown in the layer). Empty click clears.
function selectAt(context, store, ui) {
  const hit = strokeAt(store.state.whiteboard, context.point, ERASER_TOLERANCE)
  if (hit) ui.selectStroke(hit.id)
  else ui.clearSelection()
}

// Double-click anywhere creates a text box with the caret ready (spec W1). Reuses
// the shared text-editing path so text lives in the common shapes[] array (C9).
function onDoubleClick(context, store) {
  const point = context.point
  const w = 180
  const h = 44
  const id = store.addShape({
    type: 'text',
    x: point.x - w / 2,
    y: point.y - h / 2,
    w,
    h,
    text: { content: '', align: 'left', valign: 'top', style: { font: HANDWRITTEN_FONT } },
  })
  context.editorUi.setTool('select')
  // Use the setup-scoped editing API passed via the interaction context;
  // calling useTextEditing() here (outside setup) would not resolve.
  context.editing?.beginTextEdit(id)
}
