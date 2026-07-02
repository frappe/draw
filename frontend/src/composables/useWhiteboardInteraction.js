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
import {
  strokeAt, lineAt, tableAt, tableCellAt, frameHeaderAt, stampAt,
  whiteboardObjectBoxes, translateWhiteboardObject,
} from '@/diagram/whiteboardModel.js'
import { rectsIntersect } from '@/diagram/geometry.js'
import { HIGHLIGHTER_WIDTH } from '@/diagram/whiteboardColors.js'

const ERASER_TOLERANCE = 6 // canvas units of slack around a stroke path
const MARQUEE_MIN = 3 // ignore sub-3px drags (treat as a click)

// Shift, Ctrl, or Cmd all act as the "add to selection" modifier (matches
// useSelection / the flowchart). Exported so per-object components share it.
export function isAdditive(event) {
  return event.shiftKey || event.ctrlKey || event.metaKey
}

// The select-helper on the whiteboard UI for each object kind.
const SELECT_FN = {
  stroke: 'selectStroke', sticky: 'selectSticky', line: 'selectLine',
  table: 'selectTable', frame: 'selectFrame', stamp: 'selectStamp',
}

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
// above strokes in the pick order; sticky/frame selection is handled by their
// own pointerdown in the layer. An additive click toggles membership; a plain
// click single-selects; an empty press starts a marquee (spec — multi-select).
function selectAt(context, store, ui) {
  const hit = whiteboardHitAt(store.state.whiteboard, context.point)
  if (!hit) return beginMarquee(context, store, ui)
  if (isAdditive(context.event)) return ui.toggleSelected(hit.kind, hit.id)
  ui[SELECT_FN[hit.kind]](hit.id)
}

// Topmost whiteboard object under the point, or null. Stamps > tables > lines >
// strokes; frames match only via their title strip so the body stays clickable.
function whiteboardHitAt(model, point) {
  const stamp = stampAt(model, point)
  if (stamp) return { kind: 'stamp', id: stamp.id }
  const table = tableAt(model, point)
  if (table) return { kind: 'table', id: table.id }
  const line = lineAt(model, point, ERASER_TOLERANCE)
  if (line) return { kind: 'line', id: line.id }
  const stroke = strokeAt(model, point, ERASER_TOLERANCE)
  if (stroke) return { kind: 'stroke', id: stroke.id }
  const frame = frameHeaderAt(model, point)
  if (frame) return { kind: 'frame', id: frame.id }
  return null
}

// Rubber-band marquee on empty canvas. A plain press clears the selection first;
// an additive press keeps it and merges the hits on release. Window listeners
// (like useMarquee/flowchart) keep the box correct as the surface scrolls;
// client→logical is undo-pan then undo-zoom against the surface rect at begin.
function beginMarquee(context, store, ui) {
  const { event, point, editorUi } = context
  const additive = isAdditive(event)
  if (!additive) ui.clearSelection()
  const rect = event.currentTarget.getBoundingClientRect()
  const viewport = editorUi.viewport
  const start = point
  const toLogical = (moveEvent) => ({
    x: (moveEvent.clientX - rect.left - viewport.state.panX) / viewport.state.zoom,
    y: (moveEvent.clientY - rect.top - viewport.state.panY) / viewport.state.zoom,
  })
  ui.state.marquee = { x: start.x, y: start.y, w: 0, h: 0 }
  const move = (moveEvent) => {
    const p = toLogical(moveEvent)
    ui.state.marquee = {
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      w: Math.abs(p.x - start.x),
      h: Math.abs(p.y - start.y),
    }
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    finishMarquee(store, ui, additive)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

// On release, select every object whose bbox intersects the marquee. A sub-3px
// box is treated as a click (selection already cleared above if not additive).
function finishMarquee(store, ui, additive) {
  const box = ui.state.marquee
  ui.state.marquee = null
  if (!box || box.w < MARQUEE_MIN || box.h < MARQUEE_MIN) return
  const hits = whiteboardObjectBoxes(store.state.whiteboard)
    .filter((object) => rectsIntersect(box, object.box))
    .map((object) => ({ kind: object.kind, id: object.id }))
  if (!hits.length) return
  additive ? ui.addToSelection(hits) : ui.setSelection(hits)
}

// Group move: pressing a member of a multi-selection drags EVERY selected object
// by the same delta. Called from the sticky/frame pointerdown handlers (the only
// draggable objects), but moves all selected kinds. Live-mutates the model for a
// smooth preview (outside history), then commits the total translation as ONE
// undoable unit on release — a click with no movement keeps the group intact.
export function startGroupMove(event, store, editorUi, ui) {
  event.stopPropagation()
  const items = ui.state.selection.map((item) => ({ ...item }))
  const model = store.state.whiteboard
  const startX = event.clientX
  const startY = event.clientY
  let lastDx = 0
  let lastDy = 0
  const move = (moveEvent) => {
    const zoom = editorUi.viewport.state.zoom
    const dx = (moveEvent.clientX - startX) / zoom
    const dy = (moveEvent.clientY - startY) / zoom
    // Apply only the incremental step so preview position stays exact.
    for (const item of items) translateWhiteboardObject(model, item.kind, item.id, dx - lastDx, dy - lastDy)
    lastDx = dx
    lastDy = dy
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    if (!lastDx && !lastDy) return // a click, not a drag → keep the group selected
    // Undo the live preview, then commit the whole move once for clean undo.
    for (const item of items) translateWhiteboardObject(model, item.kind, item.id, -lastDx, -lastDy)
    store.updateWhiteboardModel('Move objects', (m) => {
      for (const item of items) translateWhiteboardObject(m, item.kind, item.id, lastDx, lastDy)
    })
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
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
