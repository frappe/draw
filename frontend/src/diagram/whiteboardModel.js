// Whiteboard model — pure data + mutations (spec diagram-types Part C9).
// A whiteboard holds freehand strokes and sticky notes alongside the shared
// shapes[]/connectors[] arrays (those stay in the common store). IDs are stable
// (factories nextId), never array index (Part G2). Stroke point-paths are
// simplified on pointer-up by the whiteboard agent (Part G7) before they reach
// these mutations. Each mutation operates in place; the store wraps them in
// commit() for undo (Part G6).

import { nextId } from './factories.js'
import { distanceToSegment } from './geometry.js'

// Pen and highlighter are the two stroke kinds (spec C3); eraser removes whole
// strokes rather than producing one.
export function makeStroke(points, partial = {}) {
  return {
    id: nextId('w'),
    points: points || [],
    color: partial.color || '#1F2933',
    width: partial.width || 3,
    kind: partial.kind || 'pen',
    zIndex: partial.zIndex || 0,
  }
}

const STICKY_SIZE = { w: 180, h: 180 }

export function makeStickyNote(x, y, partial = {}) {
  return {
    id: nextId('sn'),
    x,
    y,
    ...STICKY_SIZE,
    text: partial.text || '',
    color: partial.color || '#FFE8A3',
    // Who created it, shown as an author chip (spec — Whimsical-style).
    author: partial.author || '',
    zIndex: partial.zIndex || 0,
  }
}

// A straight line with selectable endpoint styles ('none' | 'arrow' | 'dot').
export function makeLine(x1, y1, x2, y2, partial = {}) {
  return {
    id: nextId('wl'),
    x1, y1, x2, y2,
    color: partial.color || '#171717',
    width: partial.width || 2,
    start: partial.start || 'none',
    end: partial.end || 'arrow',
    zIndex: partial.zIndex || 0,
  }
}

// Default cell size for a new table. The size picker chooses only the grid
// dimensions (#134), so these stay the single source of truth for a cell's box —
// shared by makeTable and the centred-insert maths (tableSizePicker.js).
export const TABLE_CELL_W = 120
export const TABLE_CELL_H = 40

// A simple fixed grid table. `cells` maps "row,col" → text. `rows`/`cols` are
// required: every creation path supplies an explicit size (the size picker, or
// the armed-tool default) — there is no built-in 3×3 fallback anymore (#134).
export function makeTable(x, y, partial = {}) {
  return {
    id: nextId('wt'),
    x,
    y,
    rows: partial.rows,
    cols: partial.cols,
    cellW: partial.cellW || TABLE_CELL_W,
    cellH: partial.cellH || TABLE_CELL_H,
    color: partial.color || '#171717',
    // First row rendered as a header (tinted band + bold text) when set (#338).
    hasHeader: partial.hasHeader ?? false,
    cells: partial.cells || {},
    zIndex: partial.zIndex || 0,
  }
}

export function createWhiteboard(sketchStyle = false) {
  return { sketchStyle, strokes: [], stickyNotes: [], lines: [], tables: [] }
}

// True when a whiteboard has no drawn content — no strokes, stickies, lines,
// tables or shared shapes. One source of truth for the blank-board 100% open
// (DiagramCanvas) and the empty-state hint (WhiteboardLayer).
export function isWhiteboardEmpty(model, shapes = []) {
  return (
    !!model &&
    !model.strokes.length &&
    !model.stickyNotes.length &&
    !(model.lines || []).length &&
    !(model.tables || []).length &&
    !shapes.length
  )
}

// --- Stacking order (#27) -----------------------------------------------------
// Whiteboard objects share ONE zIndex scale with the shared shapes[], so an image
// added after a freehand stroke sits above it and Arrange can move either past the
// other. The kinds are listed in the order boards used to paint them, which is the
// tie-break for documents saved before objects carried a zIndex (see
// `backfillWhiteboardZIndex` in schema.js).
export const WHITEBOARD_KINDS = ['stroke', 'line', 'table', 'sticky']

const WB_LIST = {
  stroke: (model) => model.strokes || [],
  line: (model) => model.lines || [],
  table: (model) => model.tables || [],
  sticky: (model) => model.stickyNotes || [],
}

// Every whiteboard object as { kind, id, object }, in painting order (ascending
// zIndex). One source of truth for the canvas, export and thumbnail renderers.
export function whiteboardObjectsInZOrder(model) {
  const out = []
  for (const kind of WHITEBOARD_KINDS) {
    for (const object of WB_LIST[kind](model)) out.push({ kind, id: object.id, object })
  }
  return out.sort((a, b) => (a.object.zIndex || 0) - (b.object.zIndex || 0))
}

export function maxWhiteboardZIndex(model) {
  if (!model) return 0
  let max = 0
  for (const kind of WHITEBOARD_KINDS) {
    for (const object of WB_LIST[kind](model)) max = Math.max(max, object.zIndex || 0)
  }
  return max
}

export function tableById(model, id) {
  return (model.tables || []).find((table) => table.id === id)
}

export function lineById(model, id) {
  return (model.lines || []).find((line) => line.id === id)
}

export function addLine(model, x1, y1, x2, y2, partial = {}) {
  const line = makeLine(x1, y1, x2, y2, partial)
  if (!model.lines) model.lines = []
  model.lines.push(line)
  return line.id
}

export function removeLine(model, id) {
  model.lines = (model.lines || []).filter((line) => line.id !== id)
}

export function addTable(model, x, y, partial = {}) {
  const table = makeTable(x, y, partial)
  if (!model.tables) model.tables = []
  model.tables.push(table)
  return table.id
}

export function removeTable(model, id) {
  model.tables = (model.tables || []).filter((table) => table.id !== id)
}

// Set (or clear) the text of one table cell, keyed "row,col" (Part C9).
export function setTableCell(table, row, col, text) {
  const key = `${row},${col}`
  if (text) table.cells = { ...table.cells, [key]: text }
  else {
    const next = { ...table.cells }
    delete next[key]
    table.cells = next
  }
}

export function strokeById(model, id) {
  return model.strokes.find((stroke) => stroke.id === id)
}

export function stickyNoteById(model, id) {
  return model.stickyNotes.find((note) => note.id === id)
}

export function addStroke(model, points, partial = {}) {
  const stroke = makeStroke(points, partial)
  model.strokes.push(stroke)
  return stroke.id
}

export function removeStroke(model, id) {
  model.strokes = model.strokes.filter((stroke) => stroke.id !== id)
}

export function addStickyNote(model, x, y, partial = {}) {
  const note = makeStickyNote(x, y, partial)
  model.stickyNotes.push(note)
  return note.id
}

export function removeStickyNote(model, id) {
  model.stickyNotes = model.stickyNotes.filter((note) => note.id !== id)
}

// Smallest distance from a point to any segment of a stroke's path. Used by the
// eraser to hit-test the actual path geometry, NOT a bounding box (spec C10/W3).
export function distanceToStroke(point, stroke) {
  const points = stroke.points
  if (!points.length) return Infinity
  if (points.length === 1) return Math.hypot(point.x - points[0].x, point.y - points[0].y)
  let min = Infinity
  for (let i = 0; i < points.length - 1; i += 1) {
    min = Math.min(min, distanceToSegment(point, points[i], points[i + 1]))
  }
  return min
}

// The topmost stroke whose path passes within `tolerance` canvas units of the
// point, or null. Later strokes (drawn on top) win ties.
export function strokeAt(model, point, tolerance) {
  let hit = null
  for (const stroke of model.strokes) {
    if (distanceToStroke(point, stroke) <= tolerance + stroke.width / 2) hit = stroke
  }
  return hit
}

// The topmost line whose segment passes within `tolerance` canvas units, or null.
export function lineAt(model, point, tolerance) {
  let hit = null
  for (const line of model.lines || []) {
    const a = { x: line.x1, y: line.y1 }
    const b = { x: line.x2, y: line.y2 }
    if (distanceToSegment(point, a, b) <= tolerance + line.width / 2) hit = line
  }
  return hit
}

// A table's rows/cols come from the document, which for a shared/public diagram
// is untrusted — and they drive nested render loops, so a crafted `rows: 1e9`
// would hang every viewer. Clamp to a generous ceiling (far above the picker's
// max of 10) everywhere the counts are iterated or measured; a real table is
// untouched, an absurd one is bounded (#338).
export const MAX_TABLE_DIM = 50

export function tableRows(table) {
  return Math.max(0, Math.min(MAX_TABLE_DIM, Math.floor(table.rows) || 0))
}

export function tableCols(table) {
  return Math.max(0, Math.min(MAX_TABLE_DIM, Math.floor(table.cols) || 0))
}

export function tableWidth(table) {
  return tableCols(table) * table.cellW
}

export function tableHeight(table) {
  return tableRows(table) * table.cellH
}

// The topmost table whose bounding box contains the point, or null.
export function tableAt(model, point) {
  let hit = null
  for (const table of model.tables || []) {
    const inside =
      point.x >= table.x &&
      point.x <= table.x + tableWidth(table) &&
      point.y >= table.y &&
      point.y <= table.y + tableHeight(table)
    if (inside) hit = table
  }
  return hit
}

// ----- multi-select geometry (marquee + group move) -------------------------

const STROKE_PAD = 4 // padding so a thin/empty stroke still yields a hittable box

// Axis-aligned bounding box of a stroke's path (canvas units).
function strokeBox(stroke) {
  const points = stroke.points || []
  if (!points.length) return { x: stroke.x || 0, y: stroke.y || 0, w: 0, h: 0 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  const pad = STROKE_PAD + (stroke.width || 0) / 2
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }
}

function lineBox(line) {
  const x = Math.min(line.x1, line.x2)
  const y = Math.min(line.y1, line.y2)
  return { x, y, w: Math.abs(line.x2 - line.x1), h: Math.abs(line.y2 - line.y1) }
}

// Every whiteboard object as { kind, id, box } for marquee intersection testing.
// Boxes are in canvas units, matching the marquee rect (Part G4).
export function whiteboardObjectBoxes(model) {
  const out = []
  for (const s of model.strokes || []) out.push({ kind: 'stroke', id: s.id, box: strokeBox(s) })
  for (const n of model.stickyNotes || []) out.push({ kind: 'sticky', id: n.id, box: { x: n.x, y: n.y, w: n.w, h: n.h } })
  for (const l of model.lines || []) out.push({ kind: 'line', id: l.id, box: lineBox(l) })
  for (const t of model.tables || []) out.push({ kind: 'table', id: t.id, box: { x: t.x, y: t.y, w: tableWidth(t), h: tableHeight(t) } })
  return out
}

// Translate one object by (dx, dy) in place (group move). Strokes shift every
// point; lines shift both endpoints; the rest shift their x/y origin.
export function translateWhiteboardObject(model, kind, id, dx, dy) {
  if (kind === 'stroke') {
    const s = strokeById(model, id)
    if (s) s.points = (s.points || []).map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }))
  } else if (kind === 'sticky') {
    const n = stickyNoteById(model, id)
    if (n) { n.x += dx; n.y += dy }
  } else if (kind === 'line') {
    const l = lineById(model, id)
    if (l) { l.x1 += dx; l.y1 += dy; l.x2 += dx; l.y2 += dy }
  } else if (kind === 'table') {
    const t = tableById(model, id)
    if (t) { t.x += dx; t.y += dy }
  }
}

// Which cell of `table` the point falls in, as { row, col }, or null if outside.
export function tableCellAt(table, point) {
  if (tableAt({ tables: [table] }, point) !== table) return null
  return {
    row: Math.min(tableRows(table) - 1, Math.floor((point.y - table.y) / table.cellH)),
    col: Math.min(tableCols(table) - 1, Math.floor((point.x - table.x) / table.cellW)),
  }
}
