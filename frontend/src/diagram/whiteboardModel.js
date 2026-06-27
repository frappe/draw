// Whiteboard model — pure data + mutations (spec diagram-types Part C9).
// A whiteboard holds freehand strokes and sticky notes alongside the shared
// shapes[]/connectors[] arrays (those stay in the common store). IDs are stable
// (factories nextId), never array index (Part G2). Stroke point-paths are
// simplified on pointer-up by the whiteboard agent (Part G7) before they reach
// these mutations. Each mutation operates in place; the store wraps them in
// commit() for undo (Part G6).

import { nextId } from './factories.js'

// Pen and highlighter are the two stroke kinds (spec C3); eraser removes whole
// strokes rather than producing one.
export const STROKE_KINDS = ['pen', 'highlighter']

export function makeStroke(points, partial = {}) {
  return {
    id: nextId('w'),
    points: points || [],
    color: partial.color || '#1F2933',
    width: partial.width || 3,
    kind: partial.kind || 'pen',
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
  }
}

// A simple fixed grid table. `cells` maps "row,col" → text.
export function makeTable(x, y, partial = {}) {
  return {
    id: nextId('wt'),
    x,
    y,
    rows: partial.rows || 3,
    cols: partial.cols || 3,
    cellW: partial.cellW || 120,
    cellH: partial.cellH || 40,
    color: partial.color || '#171717',
    cells: partial.cells || {},
  }
}

export function createWhiteboard(sketchStyle = false) {
  return { sketchStyle, strokes: [], stickyNotes: [], lines: [], tables: [] }
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

// Perpendicular distance from a point to the segment a→b (canvas units).
function distanceToSegment(point, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  if (!lengthSquared) return Math.hypot(point.x - a.x, point.y - a.y)
  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
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

export function tableWidth(table) {
  return table.cols * table.cellW
}

export function tableHeight(table) {
  return table.rows * table.cellH
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

// Which cell of `table` the point falls in, as { row, col }, or null if outside.
export function tableCellAt(table, point) {
  if (tableAt({ tables: [table] }, point) !== table) return null
  return {
    row: Math.min(table.rows - 1, Math.floor((point.y - table.y) / table.cellH)),
    col: Math.min(table.cols - 1, Math.floor((point.x - table.x) / table.cellW)),
  }
}
