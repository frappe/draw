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
import { contrastInk } from '@/diagram/whiteboardColors.js'
import { registerModeInteraction, useModeInteraction } from '@/composables/useModeInteraction.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { simplifyStroke } from '@/diagram/strokeSimplify.js'
import { strokeAt, lineAt, tableAt, tableCellAt, frameHeaderAt, stampAt } from '@/diagram/whiteboardModel.js'
import { HIGHLIGHTER_WIDTH } from '@/diagram/whiteboardColors.js'

const ERASER_TOLERANCE = 6 // canvas units of slack around a stroke path

export function useWhiteboardInteraction(store, editorUi) {
  const ui = useWhiteboardUi()
  const interactionRef = useModeInteraction()
  const drawing = { active: false, points: [] }
  const erasing = { active: false }
  const lining = { active: false, start: null }
  const framing = { active: false, start: null }
  const ctx = { store, editorUi, ui, drawing, erasing, lining, framing }

  const handlers = {
    onPointerDown: (event, context) => onPointerDown(event, context, ctx),
    onPointerMove: (event, context) => onPointerMove(event, context, ui, drawing, erasing, store, lining, framing),
    onPointerUp: (event, context) => onPointerUp(event, context, store, ui, drawing, erasing, lining, framing),
    onDoubleClick: (event, context) => onDoubleClick(context, store),
  }
  registerModeInteraction(interactionRef, handlers)
  onBeforeUnmount(() => registerModeInteraction(interactionRef, null))

  return { ui }
}

function onPointerDown(event, context, ctx) {
  if (event.button !== 0) return
  const { store, editorUi, ui, drawing, erasing, lining, framing } = ctx
  const tool = editorUi.state.tool
  if (tool === 'pen' || tool === 'highlighter') return beginStroke(context, ui, drawing, tool)
  if (tool === 'eraser') return beginErase(context, store, erasing)
  if (tool === 'laser') return ui.pushLaserPoint(context.point)
  if (tool === 'sticky') return placeSticky(context, store, ui)
  if (tool === 'line') return beginLine(context, ui, lining)
  if (tool === 'table') return placeTable(context, store, editorUi, ui)
  if (tool === 'frame') return beginFrame(context, ui, framing)
  if (tool === 'stamp') return placeStamp(context, store, editorUi, ui)
  if (tool === 'select') return selectAt(context, store, ui)
}

// Start dragging out a frame; the live preview renders from ui.liveFrame.
function beginFrame(context, ui, framing) {
  framing.active = true
  framing.start = context.point
  ui.liveFrame.value = { x: context.point.x, y: context.point.y, w: 0, h: 0, title: 'Frame' }
}

// Drop a reaction/vote stamp at the click and stay on the tool (so you can keep
// stamping — e.g. dot-voting), per spec 15.5.
function placeStamp(context, store, editorUi, ui) {
  store.addStamp(context.point.x, context.point.y, ui.state.stampKind)
}

// Start a straight line; the live preview renders from ui.liveLine until pointer-up.
function beginLine(context, ui, lining) {
  lining.active = true
  lining.start = context.point
  ui.liveLine.value = {
    x1: context.point.x,
    y1: context.point.y,
    x2: context.point.x,
    y2: context.point.y,
    color: ui.state.penColor,
    width: ui.state.penWidth,
    start: ui.state.lineStart,
    end: ui.state.lineEnd,
  }
}

// Drop a fixed-grid table with its top-left near the click, then select it.
function placeTable(context, store, editorUi, ui) {
  const id = store.addTable(context.point.x, context.point.y, {
    rows: ui.state.tableRows,
    cols: ui.state.tableCols,
    color: ui.state.penColor,
  })
  editorUi.setTool('select')
  ui.selectTable(id)
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

function onPointerMove(event, context, ui, drawing, erasing, store, lining, framing) {
  if (drawing.active) {
    drawing.points.push(context.point)
    // Re-assign so the live preview re-renders (a pushed array isn't reactive).
    ui.liveStroke.value = { ...ui.liveStroke.value, points: [...drawing.points] }
    return
  }
  if (lining.active) {
    ui.liveLine.value = { ...ui.liveLine.value, x2: context.point.x, y2: context.point.y }
    return
  }
  if (framing.active) {
    const s = framing.start
    const p = context.point
    ui.liveFrame.value = { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y), title: 'Frame' }
    return
  }
  if (erasing.active) return eraseAt(context.point, store)
  if (context.editorUi.state.tool === 'laser') return ui.pushLaserPoint(context.point)
}

function onPointerUp(event, context, store, ui, drawing, erasing, lining, framing) {
  if (drawing.active) return finishStroke(ui, drawing, store)
  if (lining.active) return finishLine(ui, lining, store)
  if (framing.active) return finishFrame(ui, framing, store, context.editorUi)
  if (erasing.active) erasing.active = false
}

// Commit the frame on pointer-up; a too-small drag drops a default-sized frame.
function finishFrame(ui, framing, store, editorUi) {
  framing.active = false
  const live = ui.liveFrame.value
  ui.liveFrame.value = null
  const start = framing.start
  framing.start = null
  if (!live) return
  const w = live.w < 40 ? 320 : live.w
  const h = live.h < 40 ? 220 : live.h
  const id = store.addFrame(live.w < 40 ? start.x : live.x, live.h < 40 ? start.y : live.y, w, h)
  editorUi.setTool('select')
  ui.selectFrame(id)
}

// Commit the line on pointer-up; discard a degenerate (zero-length) drag.
function finishLine(ui, lining, store) {
  lining.active = false
  const live = ui.liveLine.value
  ui.liveLine.value = null
  lining.start = null
  if (!live) return
  if (Math.hypot(live.x2 - live.x1, live.y2 - live.y1) < 4) return
  const id = store.addLine(live.x1, live.y1, live.x2, live.y2, {
    color: live.color,
    width: live.width,
    start: live.start,
    end: live.end,
  })
  ui.selectLine(id)
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
    author: currentAuthor(),
  })
  ui.selectSticky(id)
}

// The signed-in user's display name (from the page boot), for the sticky's chip.
function currentAuthor() {
  return (typeof window !== 'undefined' && window.full_name) || ''
}

// Select tool: pick the topmost object under the cursor. Lines and tables sit
// above strokes in the pick order; sticky selection is handled by the sticky's
// own pointerdown in the layer. Empty click clears.
function selectAt(context, store, ui) {
  const model = store.state.whiteboard
  // Stamps are small and on top → highest pick priority.
  const stamp = stampAt(model, context.point)
  if (stamp) return ui.selectStamp(stamp.id)
  const table = tableAt(model, context.point)
  if (table) return ui.selectTable(table.id)
  const line = lineAt(model, context.point, ERASER_TOLERANCE)
  if (line) return ui.selectLine(line.id)
  const stroke = strokeAt(model, context.point, ERASER_TOLERANCE)
  if (stroke) return ui.selectStroke(stroke.id)
  // Frames sit behind everything: only their title strip selects them, so a
  // click on the frame body still falls through to clear/empty.
  const frame = frameHeaderAt(model, context.point)
  if (frame) return ui.selectFrame(frame.id)
  ui.clearSelection()
}

// Double-click inside a table edits the cell under the cursor; anywhere else it
// creates a text box with the caret ready (spec W1). Text reuses the shared
// text-editing path so it lives in the common shapes[] array (C9).
function onDoubleClick(context, store) {
  const point = context.point
  const ui = useWhiteboardUi()
  const table = tableAt(store.state.whiteboard, point)
  if (table) {
    const cell = tableCellAt(table, point)
    ui.state.editingCell = { tableId: table.id, row: cell.row, col: cell.col }
    ui.selectTable(table.id)
    return
  }
  const w = 180
  const h = 44
  const id = store.addShape({
    type: 'text',
    x: point.x - w / 2,
    y: point.y - h / 2,
    w,
    h,
    text: {
      content: '',
      align: 'left',
      valign: 'top',
      style: { font: HANDWRITTEN_FONT, color: contrastInk(store.state.canvas.background || '#FFFFFF') },
    },
  })
  context.editorUi.setTool('select')
  // Use the setup-scoped editing API passed via the interaction context;
  // calling useTextEditing() here (outside setup) would not resolve.
  context.editing?.beginTextEdit(id)
}
