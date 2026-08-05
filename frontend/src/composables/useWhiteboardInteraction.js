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
import { registerModeInteraction, unregisterModeInteraction, useModeInteraction } from '@/composables/useModeInteraction.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { simplifyStroke } from '@/diagram/strokeSimplify.js'
import {
  strokeAt, lineAt, tableAt, tableCellAt,
  whiteboardObjectBoxes, whiteboardObjectsInZOrder, translateWhiteboardObject, clearVote,
} from '@/diagram/whiteboardModel.js'
import { eraseInkAt, eraseObjectsAt, sweepPoints } from '@/diagram/eraser.js'
import { rectsIntersect } from '@/diagram/geometry.js'
import { HIGHLIGHTER_WIDTH } from '@/diagram/whiteboardColors.js'
import { isAdditiveEvent, runMarqueeDrag } from '@/composables/pointer.js'

const ERASER_TOLERANCE = 6 // canvas units of slack around a stroke path
const MARQUEE_MIN = 3 // ignore sub-3px drags (treat as a click)
const TABLE_MOVE_THRESHOLD = 4 // screen px a table press must travel to become a move

// The select-helper on the whiteboard UI for each object kind.
const SELECT_FN = {
  stroke: 'selectStroke', sticky: 'selectSticky', line: 'selectLine',
  table: 'selectTable',
}

export function useWhiteboardInteraction(store, editorUi) {
  const ui = useWhiteboardUi()
  const interactionRef = useModeInteraction()
  const drawing = { active: false, points: [] }
  const erasing = { active: false }
  const lining = { active: false, start: null }
  const lasering = { active: false }
  const ctx = { store, editorUi, ui, drawing, erasing, lining, lasering }

  const handlers = {
    onPointerDown: (event, context) => onPointerDown(event, context, ctx),
    onPointerMove: (event, context) => onPointerMove(event, context, ui, drawing, erasing, store, lining, lasering),
    onPointerUp: (event, context) => onPointerUp(event, context, store, ui, drawing, erasing, lining, lasering),
    onDoubleClick: (event, context) => onDoubleClick(context, store),
  }
  registerModeInteraction(interactionRef, 'whiteboard', handlers)
  // Ownership-checked, for the same reason as the flowchart layer: a whiteboard
  // layer can be remounted while another instance holds this key.
  onBeforeUnmount(() => unregisterModeInteraction(interactionRef, 'whiteboard', handlers))

  return { ui }
}

function onPointerDown(event, context, ctx) {
  if (event.button !== 0) return
  const { store, editorUi, ui, drawing, erasing, lining, lasering } = ctx
  const tool = editorUi.state.tool
  if (tool === 'pen' || tool === 'highlighter') return beginStroke(context, ui, drawing, tool)
  if (tool === 'eraser') return beginErase(context, store, ui, erasing)
  if (tool === 'laser') {
    lasering.active = true
    return ui.setLaserDot(context.point)
  }
  if (tool === 'sticky') return placeSticky(context, store, ui)
  if (tool === 'line') return beginLine(context, ui, lining)
  if (tool === 'table') return placeTable(context, store, editorUi, ui)
  if (tool === 'text') return placeText(context, store)
  if (tool === 'select') return selectAt(context, store, ui)
}

// Drop a text box at the click and enter edit (S12 — the text tool now places on
// a single click, cursor already a crosshair). Shared with double-click-to-type.
function placeText(context, store) {
  const w = 180
  const h = 44
  const id = store.addShape({
    type: 'text',
    x: context.point.x - w / 2,
    y: context.point.y - h / 2,
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
  context.editing?.beginTextEdit(id)
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

// Start an erase gesture in the mode the eraser options select: 'ink' rubs out
// the ink under the tip, 'object' deletes whole elements (diagram/eraser.js). The
// tip erodes the live model WITHOUT history while the pointer is down; finishErase
// commits the whole drag as ONE undoable unit.
function beginErase(context, store, ui, erasing) {
  if (!store.state.whiteboard) return
  erasing.active = true
  erasing.dirty = false
  erasing.byObject = ui.state.eraserMode === 'object'
  erasing.radius = ui.state.eraserSize
  erasing.last = context.point
  erasing.removed = []
  // Hold the pre-drag arrays so the gesture can be rewound before it is committed.
  // References are enough: erasing never mutates an element in place, it replaces
  // the arrays (and a rubbed stroke with freshly built sub-paths).
  erasing.original = snapshotErasable(store.state)
  eraseStep(context.point, store, erasing)
}

function snapshotErasable(state) {
  const model = state.whiteboard
  return {
    strokes: model.strokes || [],
    lines: model.lines || [],
    tables: model.tables || [],
    stickyNotes: model.stickyNotes || [],
    shapes: state.shapes,
    connectors: state.connectors,
  }
}

function restoreErasable(state, original) {
  const model = state.whiteboard
  model.strokes = original.strokes
  model.lines = original.lines
  model.tables = original.tables
  model.stickyNotes = original.stickyNotes
  state.shapes = original.shapes
  state.connectors = original.connectors
}

function onPointerMove(event, context, ui, drawing, erasing, store, lining, lasering) {
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
  if (erasing.active) return eraseAlong(context.point, store, erasing)
  if (context.editorUi.state.tool === 'laser') {
    // Only leave a trail while the button is held (#253): hovering just moves the
    // dot, dragging accumulates a fading trail behind it.
    return lasering.active ? ui.pushLaserPoint(context.point) : ui.setLaserDot(context.point)
  }
}

function onPointerUp(event, context, store, ui, drawing, erasing, lining, lasering) {
  if (drawing.active) return finishStroke(ui, drawing, store)
  if (lining.active) return finishLine(ui, lining, store)
  if (erasing.active) return finishErase(store, erasing)
  if (lasering.active) lasering.active = false
}

// Commit the whole erase gesture as one undoable unit: rewind to the pre-drag
// document (so the history snapshot captures it) then re-apply the erase.
function finishErase(store, erasing) {
  erasing.active = false
  const original = erasing.original
  const removed = erasing.removed
  erasing.original = null
  erasing.removed = []
  if (!erasing.dirty) return
  if (erasing.byObject) return commitObjectErase(store, original, removed)
  commitInkErase(store, original)
}

// Object mode: the erased ids go through the shared delete path, which also drops
// their votes and any connector left dangling by a deleted shape.
function commitObjectErase(store, original, removed) {
  const isBlock = (item) => item.kind === 'shape' || item.kind === 'connector'
  const items = removed.filter((item) => !isBlock(item))
  const ids = removed.filter(isBlock).map((item) => item.id)
  restoreErasable(store.state, original)
  store.removeWhiteboardSelection(items, ids)
}

// Ink mode: a rubbed stroke is replaced by fresh-id sub-paths, so the eroded
// arrays themselves are the commit. Clear the votes of every object that didn't
// survive so model.votes doesn't leak stale keys across the session (the
// keyboard/Delete path already clears via removeStroke).
function commitInkErase(store, original) {
  const model = store.state.whiteboard
  // Older documents may carry no `lines` array at all; normalise so the commit and
  // the vote sweep below always see a list.
  const final = { strokes: model.strokes || [], lines: model.lines || [] }
  model.strokes = original.strokes
  model.lines = original.lines
  store.updateWhiteboardModel('Erase', (m) => {
    m.strokes = final.strokes
    m.lines = final.lines
    clearGoneVotes(m, 'stroke', original.strokes, final.strokes)
    clearGoneVotes(m, 'line', original.lines, final.lines)
  })
}

function clearGoneVotes(model, kind, before, after) {
  const surviving = new Set(after.map((object) => object.id))
  for (const object of before) {
    if (!surviving.has(object.id)) clearVote(model, kind, object.id)
  }
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

// One erase sample: the tip at `point` either rubs ink out or takes whole objects,
// depending on the mode the gesture started in. Mutates the live model without
// history — finishErase commits the whole gesture as one undoable unit.
function eraseStep(point, store, erasing) {
  if (!erasing.byObject) {
    if (eraseInkAt(store.state.whiteboard, point, erasing.radius)) erasing.dirty = true
    return
  }
  const removed = eraseObjectsAt(store.state, point, erasing.radius)
  if (!removed.length) return
  erasing.removed.push(...removed)
  erasing.dirty = true
}

// Erase everything the tip swept over since the last pointer sample, not just the
// disk under this one: pointer moves arrive far apart on a fast drag, which used
// to leave slivers of ink in the gaps (#39).
function eraseAlong(point, store, erasing) {
  for (const sample of sweepPoints(erasing.last, point, erasing.radius)) {
    eraseStep(sample, store, erasing)
  }
  erasing.last = point
}

// Drop a sticky note centered on the click (spec W4), then switch to the select
// tool and open its editor so the cursor lands in the sticky right away — rather
// than staying armed and dropping another sticky on the next click.
function placeSticky(context, store, ui) {
  const half = 90
  const id = store.addStickyNote(context.point.x - half, context.point.y - half, {
    color: ui.state.stickyColor,
    author: currentAuthor(),
  })
  ui.selectSticky(id)
  context.editorUi.setTool('select')
  ui.requestStickyEdit(id)
}

// The signed-in user's display name (from the page boot), for the sticky's chip.
function currentAuthor() {
  return (typeof window !== 'undefined' && window.full_name) || ''
}

// Select tool: pick the topmost object under the cursor (by zIndex, the order the
// canvas paints); sticky/frame selection is handled by their
// own pointerdown in the layer. An additive click toggles membership; a plain
// click single-selects; an empty press starts a marquee (spec — multi-select).
function selectAt(context, store, ui) {
  const hit = whiteboardHitAt(store.state.whiteboard, context.point)
  if (!hit) return beginMarquee(context, store, ui)
  if (isAdditiveEvent(context.event)) return ui.toggleSelected(hit.kind, hit.id)
  // A plain click single-selects. Once a table is selected its own pointerdown
  // owns the press (drag to move, click to edit the cell under it — see
  // startTableMove / WhiteboardTable.vue), so a table hit here only ever performs
  // that initial select.
  ui[SELECT_FN[hit.kind]](hit.id)
}

// Topmost whiteboard object under the point, or null. Highest zIndex wins, so a
// click picks whatever the canvas paints on top — the pick order used to be a
// fixed tables > lines > strokes, which Arrange could not change (#27). Sticky
// notes select through their own pointerdown, so they stay out of this.
function whiteboardHitAt(model, point) {
  let hit = null
  for (const { kind, id, object } of whiteboardObjectsInZOrder(model)) {
    if (hitsObject(kind, object, point)) hit = { kind, id }
  }
  return hit
}

function hitsObject(kind, object, point) {
  if (kind === 'table') return Boolean(tableAt({ tables: [object] }, point))
  if (kind === 'line') return Boolean(lineAt({ lines: [object] }, point, ERASER_TOLERANCE))
  if (kind === 'stroke') return Boolean(strokeAt({ strokes: [object] }, point, ERASER_TOLERANCE))
  return false
}

// Rubber-band marquee on empty canvas. A plain press clears the selection first;
// an additive press keeps it and merges the hits on release. Window listeners
// (like useMarquee/flowchart) keep the box correct as the surface scrolls;
// client→logical is undo-pan then undo-zoom against the surface rect at begin.
function beginMarquee(context, store, ui) {
  const { event, point, editorUi } = context
  const additive = isAdditiveEvent(event)
  if (!additive) ui.clearSelection()
  const rect = event.currentTarget.getBoundingClientRect()
  ui.state.marquee = { x: point.x, y: point.y, w: 0, h: 0 }
  runMarqueeDrag({
    start: point,
    rect,
    viewport: editorUi.viewport,
    onUpdate: (box) => (ui.state.marquee = box),
    onDone: () => finishMarquee(store, ui, additive),
  })
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
    window.removeEventListener('pointercancel', up)
    if (!lastDx && !lastDy) return // a click, not a drag → keep the group selected
    // Undo the live preview, then commit the whole move once for clean undo.
    for (const item of items) translateWhiteboardObject(model, item.kind, item.id, -lastDx, -lastDy)
    store.updateWhiteboardModel('Move objects', (m) => {
      for (const item of items) translateWhiteboardObject(m, item.kind, item.id, lastDx, lastDy)
    })
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  // A pointercancel mid-move (a touch scroll claiming the gesture) otherwise leaks
  // these window listeners AND leaves the group shifted by the live preview with no
  // history commit. Finish as if released so the move lands as one undoable step.
  window.addEventListener('pointercancel', up)
}

// Press on a whiteboard table (select tool). Like the sticky, the table owns its
// own press once selected: a drag past a small threshold moves it (with every
// co-selected object), while a press that never crosses the threshold stays a
// plain click that drops the caret into the cell under it (Frappe-Writer T2 cell
// edit). Live-mutates the model for a smooth preview, then commits the whole
// translation as ONE undoable unit (#133). `point` is the press in canvas units.
export function startTableMove(event, store, editorUi, ui, table, point) {
  const model = store.state.whiteboard
  const items = ui.state.selection.map((item) => ({ ...item }))
  const cell = tableCellAt(table, point)
  const startX = event.clientX
  const startY = event.clientY
  let lastDx = 0
  let lastDy = 0
  let moving = false
  const move = (moveEvent) => {
    // Threshold in screen pixels so a small wiggle stays a click (still opening
    // cell-edit) at any zoom; the applied delta is divided by zoom for canvas units.
    if (!moving && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < TABLE_MOVE_THRESHOLD) return
    moving = true
    const zoom = editorUi.viewport.state.zoom
    const dx = (moveEvent.clientX - startX) / zoom
    const dy = (moveEvent.clientY - startY) / zoom
    for (const item of items) translateWhiteboardObject(model, item.kind, item.id, dx - lastDx, dy - lastDy)
    lastDx = dx
    lastDy = dy
  }
  const finish = (finishEvent) => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', finish)
    window.removeEventListener('pointercancel', finish)
    if (moving) {
      // Undo the live preview, then commit the whole move once for clean undo.
      for (const item of items) translateWhiteboardObject(model, item.kind, item.id, -lastDx, -lastDy)
      store.updateWhiteboardModel('Move objects', (m) => {
        for (const item of items) translateWhiteboardObject(m, item.kind, item.id, lastDx, lastDy)
      })
      return
    }
    // A plain click (a real release, not a cancelled gesture) opens the cell under
    // the press for inline editing (T2). editingCell is set directly — no reselect —
    // so it survives (setSelection would clear it).
    if (cell && finishEvent?.type !== 'pointercancel') {
      ui.state.editingCell = { tableId: table.id, row: cell.row, col: cell.col }
    }
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', finish)
  // Match startGroupMove: a pointercancel must tear the listeners down and land any
  // in-progress move as one undoable step, never stranding the preview.
  window.addEventListener('pointercancel', finish)
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
    return true
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
  // Consume the event so DiagramCanvas's block double-click path doesn't also run.
  return true
}
