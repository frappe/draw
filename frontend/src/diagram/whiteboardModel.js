// Whiteboard model — pure data + mutations (spec diagram-types Part C9).
// A whiteboard holds freehand strokes and sticky notes alongside the shared
// shapes[]/connectors[] arrays (those stay in the common store). IDs are stable
// (factories nextId), never array index (Part G2). Stroke point-paths are
// simplified on pointer-up by the whiteboard agent (Part G7) before they reach
// these mutations. Each mutation operates in place; the store wraps them in
// commit() for undo (Part G6).

import { nextId } from './factories.js'
import { distanceToSegment } from './geometry.js'
import { hasFormatting, normalizeRuns, runsToText, toRuns } from './richText.js'

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
    // Horizontal text alignment for every cell: 'left' | 'center' | 'right'.
    align: partial.align || 'left',
    // Per-column widths / per-row heights only materialise once a border is
    // dragged; absent means every column/row keeps the uniform cellW/cellH.
    colWidths: partial.colWidths,
    rowHeights: partial.rowHeights,
    // Merged cell rectangles ({row,col,rowspan,colspan}); absent means none.
    merges: partial.merges,
    cells: partial.cells || {},
    // Inline formatting per cell, same "row,col" keys as `cells` but holding
    // the text split into marked runs. Only cells that carry formatting appear
    // here; `cells` stays the plain-text source of truth (#344, see richText).
    cellRuns: partial.cellRuns,
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

// Set (or clear) the text of one table cell, keyed "row,col" (Part C9). Plain
// text, so any inline formatting the cell carried is dropped with it.
export function setTableCell(table, row, col, text) {
  setTableCellRuns(table, row, col, text ? [{ text }] : [])
}

// The single writer for cell content (#344). `cells` keeps the plain string so
// every existing reader is unaffected; `cellRuns` mirrors it only when the cell
// actually carries formatting, so a plain cell adds nothing to the document.
export function setTableCellRuns(table, row, col, runs) {
  const key = `${row},${col}`
  const clean = normalizeRuns(runs)
  const text = runsToText(clean)
  table.cells = withKey(table.cells, key, text || null)
  table.cellRuns = withKey(table.cellRuns, key, hasFormatting(clean) ? clean : null)
}

// A cell's content as runs, whether it was stored plain or formatted. The one
// read path for both the canvas and the export, so they cannot drift.
export function tableCellRuns(table, row, col) {
  const key = `${row},${col}`
  const runs = (table.cellRuns || {})[key]
  if (runs) {
    // The plain string stays authoritative: if the two ever disagree (a hand-
    // edited or partly-migrated document), render the text rather than stale runs.
    const text = (table.cells || {})[key] || ''
    if (runsToText(runs) === text) return toRuns(runs)
  }
  return toRuns((table.cells || {})[key])
}

// Copy of `map` with `key` set, or removed when the value is null. Absent beats
// an empty entry so documents stay lean.
function withKey(map, key, value) {
  const next = { ...(map || {}) }
  if (value === null) delete next[key]
  else next[key] = value
  return next
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

// Smallest a column/row can be dragged to, so a cell never collapses to nothing.
export const MIN_TABLE_CELL = 24

// Effective per-column widths / per-row heights. The stored arrays are optional
// and may be short (only the dragged indices are set), so fall back to the
// uniform cellW/cellH per index — old documents and un-resized tables are
// unchanged, and a resize only has to record the columns it touched.
export function colWidthsOf(table) {
  const stored = table.colWidths || []
  return Array.from({ length: tableCols(table) }, (_, c) =>
    Math.max(MIN_TABLE_CELL, stored[c] || table.cellW),
  )
}

export function rowHeightsOf(table) {
  const stored = table.rowHeights || []
  return Array.from({ length: tableRows(table) }, (_, r) =>
    Math.max(MIN_TABLE_CELL, stored[r] || table.cellH),
  )
}

// Cumulative start offsets (length n+1); offsets[i] is the left/top edge of i.
function cumulative(sizes) {
  const out = [0]
  for (const size of sizes) out.push(out[out.length - 1] + size)
  return out
}
export const colOffsets = (table) => cumulative(colWidthsOf(table))
export const rowOffsets = (table) => cumulative(rowHeightsOf(table))

export function tableWidth(table) {
  const offsets = colOffsets(table)
  return offsets[offsets.length - 1]
}

export function tableHeight(table) {
  const offsets = rowOffsets(table)
  return offsets[offsets.length - 1]
}

// The pixel box {x,y,w,h} of one cell (canvas units), honouring per-column/row
// sizes. The single source of truth for cell geometry used by render + hit-test.
export function cellBox(table, row, col) {
  const cx = colOffsets(table)
  const ry = rowOffsets(table)
  return {
    x: table.x + cx[col],
    y: table.y + ry[row],
    w: cx[col + 1] - cx[col],
    h: ry[row + 1] - ry[row],
  }
}

// Which segment of `offsets` contains `pos` (its index), clamped to the last one.
function segmentIndex(offsets, pos) {
  for (let i = 0; i < offsets.length - 1; i += 1) {
    if (pos < offsets[i + 1]) return i
  }
  return Math.max(0, offsets.length - 2)
}

// Resize one column / row, seeding the size array from the uniform default so
// only the dragged index changes. Min-clamped; wrapped in a store commit each.
export function resizeTableColumn(table, col, width) {
  const widths = colWidthsOf(table)
  widths[col] = Math.max(MIN_TABLE_CELL, Math.round(width))
  table.colWidths = widths
}

export function resizeTableRow(table, row, height) {
  const heights = rowHeightsOf(table)
  heights[row] = Math.max(MIN_TABLE_CELL, Math.round(height))
  table.rowHeights = heights
}

// ----- cell merges (#338) ----------------------------------------------------
// A merge shows a rectangle of cells as one, anchored at its top-left cell:
// { row, col, rowspan, colspan }. The anchor renders spanning the rectangle; the
// cells it covers are skipped. Stored on `table.merges` (absent = none).
export function tableMerges(table) {
  // Bounded like the row/col counts: the render checks cell coverage against every
  // merge, per cell, so a shared/public diagram can't ship a giant `merges` array
  // to blow that up — a real table has at most one merge per cell (#338).
  return (table.merges || []).slice(0, MAX_TABLE_DIM * MAX_TABLE_DIM)
}

function rectsOverlap(ra, ca, rsa, csa, rb, cb, rsb, csb) {
  return ra < rb + rsb && rb < ra + rsa && ca < cb + csb && cb < ca + csa
}

// The merge whose rectangle covers (row, col), or null. Anchors count too.
export function mergeCovering(table, row, col) {
  return (
    tableMerges(table).find(
      (m) =>
        row >= m.row && row < m.row + m.rowspan && col >= m.col && col < m.col + m.colspan,
    ) || null
  )
}

// A covered cell that is NOT its merge's anchor — the render skips these.
export function isCoveredCell(table, row, col) {
  const m = mergeCovering(table, row, col)
  return !!m && !(m.row === row && m.col === col)
}

// The pixel box of a cell, spanning its merge when it is the anchor; otherwise
// the plain cell. Covered non-anchor cells return their own box (never drawn).
export function cellSpanBox(table, row, col) {
  const start = cellBox(table, row, col)
  const m = mergeCovering(table, row, col)
  if (!m || m.row !== row || m.col !== col) return start
  const endRow = Math.min(tableRows(table) - 1, m.row + m.rowspan - 1)
  const endCol = Math.min(tableCols(table) - 1, m.col + m.colspan - 1)
  const end = cellBox(table, endRow, endCol)
  return { x: start.x, y: start.y, w: end.x + end.w - start.x, h: end.y + end.h - start.y }
}

// Merge the cell rectangle (r0,c0)-(r1,c1) into one, dropping any merges it
// overlaps. A single cell is ignored. Text stays in the anchor (top-left) cell.
export function mergeTableCells(table, r0, c0, r1, c1) {
  const row = Math.max(0, Math.min(r0, r1))
  const col = Math.max(0, Math.min(c0, c1))
  const rowspan = Math.min(tableRows(table), Math.max(r0, r1) + 1) - row
  const colspan = Math.min(tableCols(table), Math.max(c0, c1) + 1) - col
  if (rowspan * colspan <= 1) return
  const kept = tableMerges(table).filter(
    (m) => !rectsOverlap(m.row, m.col, m.rowspan, m.colspan, row, col, rowspan, colspan),
  )
  table.merges = [...kept, { row, col, rowspan, colspan }]
}

// Un-merge the cell at (row, col) — remove the merge covering it.
export function unmergeTableCell(table, row, col) {
  const m = mergeCovering(table, row, col)
  if (m) table.merges = tableMerges(table).filter((x) => x !== m)
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
    row: segmentIndex(rowOffsets(table), point.y - table.y),
    col: segmentIndex(colOffsets(table), point.x - table.x),
  }
}
