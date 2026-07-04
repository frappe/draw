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
    // Who created it, shown as an author chip (spec — Whimsical-style).
    author: partial.author || '',
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
  return { sketchStyle, strokes: [], stickyNotes: [], lines: [], tables: [], votes: {} }
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

// --- Per-object votes (T3): a chat-reaction-style up/down tally attached to any
// board object (stroke/sticky/line/table/image), keyed by "kind:id". Kept in one
// map on the model rather than on each heterogeneous object, so rendering and
// cleanup stay in a single place. Replaces the old free-floating stamp/dot tool.
export function voteKey(kind, id) {
  return `${kind}:${id}`
}

export function voteFor(model, kind, id) {
  return (model?.votes || {})[voteKey(kind, id)] || { up: 0, down: 0 }
}

// Bump the up or down tally for an object, never below zero. Returns nothing;
// callers wrap it in a history commit.
export function applyVote(model, kind, id, dir, delta = 1) {
  if (!model.votes) model.votes = {}
  const key = voteKey(kind, id)
  const current = model.votes[key] || { up: 0, down: 0 }
  const next = { ...current, [dir]: Math.max(0, (current[dir] || 0) + delta) }
  if (!next.up && !next.down) delete model.votes[key]
  else model.votes[key] = next
}

// Drop an object's votes when it is deleted so the map never leaks stale keys.
export function clearVote(model, kind, id) {
  if (model?.votes) delete model.votes[voteKey(kind, id)]
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
    row: Math.min(table.rows - 1, Math.floor((point.y - table.y) / table.cellH)),
    col: Math.min(table.cols - 1, Math.floor((point.x - table.x) / table.cellW)),
  }
}
