import { describe, it, expect } from 'vitest'
import { ESPRESSO_SANS } from './textFonts.js'
import {
  tableCellStyle,
  setTableCellStyle,
  TABLE_FONT_SIZE,
  createWhiteboard,
  makeStickyNote,
  stickyRuns,
  setStickyRuns,
  stickyTextStyle,
  setStickyTextStyle,
  STICKY_TEXT_SIZE,
  addStroke,
  removeStroke,
  addStickyNote,
  distanceToStroke,
  strokeAt,
  makeTable,
  tableRows,
  tableCols,
  tableWidth,
  tableHeight,
  MAX_TABLE_DIM,
  MIN_TABLE_CELL,
  colWidthsOf,
  cellBox,
  resizeTableColumn,
  resizeTableRow,
  tableCellAt,
  mergeTableCells,
  unmergeTableCell,
  mergeCovering,
  isCoveredCell,
  cellSpanBox,
  tableMerges,
  setTableCell,
  setTableCellRuns,
  tableCellRuns,
} from './whiteboardModel.js'
import { contrastInk, strokeOpacity, HIGHLIGHTER_OPACITY, PEN_OPACITY } from './whiteboardColors.js'

describe('whiteboard model', () => {
  it('adds and removes strokes with stable ids', () => {
    const model = createWhiteboard()
    const id = addStroke(model, [{ x: 0, y: 0 }, { x: 10, y: 0 }], { color: '#000', width: 4 })
    expect(model.strokes).toHaveLength(1)
    expect(model.strokes[0].id).toBe(id)
    removeStroke(model, id)
    expect(model.strokes).toHaveLength(0)
  })

  it('stores the opacity a stroke was drawn at, defaulting per ink', () => {
    // #409: opacity used to be a live editor preference, so it reached neither the
    // saved document nor anything rendering from it. It travels with the stroke now.
    const model = createWhiteboard()
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }]
    addStroke(model, points, { kind: 'pen', opacity: 0.3 })
    addStroke(model, points, { kind: 'highlighter' })
    addStroke(model, points, {})
    expect(model.strokes.map((s) => s.opacity)).toEqual([0.3, HIGHLIGHTER_OPACITY, PEN_OPACITY])
  })

  it('keeps a fully transparent stroke transparent', () => {
    // Guards the `typeof === 'number'` check: `partial.opacity || default` would
    // read 0 as absent and paint the stroke at full strength.
    const model = createWhiteboard()
    addStroke(model, [{ x: 0, y: 0 }, { x: 10, y: 0 }], { opacity: 0 })
    expect(model.strokes[0].opacity).toBe(0)
  })

  it('hit-tests stroke path geometry, not the bounding box', () => {
    // An L-shaped stroke: the bbox would falsely contain the inner corner area.
    const stroke = {
      id: 'w1',
      width: 2,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
    }
    // A point inside the bbox but far from both segments must NOT hit the path.
    expect(distanceToStroke({ x: 20, y: 60 }, stroke)).toBeGreaterThan(20)
    // A point right on the horizontal segment hits.
    expect(distanceToStroke({ x: 50, y: 0 }, stroke)).toBeLessThan(1)
  })

  it('strokeAt returns the topmost stroke within tolerance', () => {
    const model = createWhiteboard()
    addStroke(model, [{ x: 0, y: 0 }, { x: 100, y: 0 }], { width: 2 })
    const top = addStroke(model, [{ x: 0, y: 0 }, { x: 100, y: 0 }], { width: 2 })
    expect(strokeAt(model, { x: 50, y: 1 }, 6).id).toBe(top)
    expect(strokeAt(model, { x: 50, y: 200 }, 6)).toBeNull()
  })

  it('sticky notes default to a soft color and given position', () => {
    const model = createWhiteboard()
    const id = addStickyNote(model, 40, 60)
    const note = model.stickyNotes.find((n) => n.id === id)
    expect(note.x).toBe(40)
    expect(note.y).toBe(60)
    expect(note.w).toBeGreaterThan(0)
  })
})

describe('whiteboard table (#338)', () => {
  it('defaults hasHeader to false and accepts it as a partial', () => {
    expect(makeTable(0, 0, { rows: 3, cols: 3 }).hasHeader).toBe(false)
    expect(makeTable(0, 0, { rows: 3, cols: 3, hasHeader: true }).hasHeader).toBe(true)
  })

  it('clamps row/col counts so an untrusted document cannot drive an unbounded render', () => {
    // A real table is untouched; an absurd one is bounded to the ceiling.
    expect(tableRows({ rows: 4 })).toBe(4)
    expect(tableCols({ cols: 6 })).toBe(6)
    expect(tableRows({ rows: 1e9 })).toBe(MAX_TABLE_DIM)
    expect(tableCols({ cols: 1e9 })).toBe(MAX_TABLE_DIM)
    // Missing / non-numeric counts collapse to zero rather than NaN.
    expect(tableRows({})).toBe(0)
    expect(tableCols({ cols: 'x' })).toBe(0)
  })

  it('measures width/height from the clamped counts, not the raw fields', () => {
    const huge = { rows: 1e9, cols: 1e9, cellW: 120, cellH: 40 }
    expect(tableWidth(huge)).toBe(MAX_TABLE_DIM * 120)
    expect(tableHeight(huge)).toBe(MAX_TABLE_DIM * 40)
  })
})

describe('whiteboard table resize + alignment (#338)', () => {
  const base = { x: 10, y: 20, rows: 3, cols: 3, cellW: 100, cellH: 40 }

  it('defaults align to left and columns/rows to the uniform size', () => {
    expect(makeTable(0, 0, { rows: 2, cols: 2 }).align).toBe('left')
    expect(colWidthsOf(base)).toEqual([100, 100, 100])
  })

  it('resizes a single column/row, seeding the arrays from the uniform default', () => {
    const table = { ...base }
    resizeTableColumn(table, 1, 160)
    expect(table.colWidths).toEqual([100, 160, 100])
    resizeTableRow(table, 0, 70)
    expect(table.rowHeights).toEqual([70, 40, 40])
    expect(tableWidth(table)).toBe(360)
    expect(tableHeight(table)).toBe(150)
  })

  it('clamps a column below the minimum cell size', () => {
    const table = { ...base }
    resizeTableColumn(table, 0, 4)
    expect(table.colWidths[0]).toBe(MIN_TABLE_CELL)
  })

  it('cellBox honours per-column widths', () => {
    const table = { ...base, colWidths: [100, 160, 100] }
    // Cell (0,2) starts after col 0 (100) + col 1 (160) = 260, offset by table.x.
    expect(cellBox(table, 0, 2)).toEqual({ x: 10 + 260, y: 20, w: 100, h: 40 })
  })

  it('hit-tests the right cell after a column is widened', () => {
    const table = { ...base, colWidths: [100, 160, 100] }
    // A point past the widened col 1 (100..260) lands in col 2, not col 1.
    expect(tableCellAt(table, { x: 10 + 270, y: 20 + 10 }).col).toBe(2)
    expect(tableCellAt(table, { x: 10 + 150, y: 20 + 10 }).col).toBe(1)
  })
})

describe('whiteboard table cell merge/split (#338)', () => {
  const base = () => ({ x: 0, y: 0, rows: 3, cols: 3, cellW: 100, cellH: 40 })

  it('merges a cell rectangle into one anchored at its top-left, ignoring single cells', () => {
    const table = base()
    mergeTableCells(table, 0, 1, 1, 2) // rows 0-1, cols 1-2
    expect(table.merges).toEqual([{ row: 0, col: 1, rowspan: 2, colspan: 2 }])
    // A 1x1 "merge" is a no-op.
    const single = base()
    mergeTableCells(single, 2, 2, 2, 2)
    expect(single.merges).toBeUndefined()
  })

  it('normalises the rectangle regardless of drag direction and clamps to bounds', () => {
    const table = base()
    mergeTableCells(table, 2, 2, 0, 0) // bottom-right to top-left
    expect(table.merges[0]).toEqual({ row: 0, col: 0, rowspan: 3, colspan: 3 })
  })

  it('marks covered non-anchor cells and spans the anchor box', () => {
    const table = base()
    mergeTableCells(table, 0, 0, 0, 1) // merge (0,0)-(0,1)
    expect(isCoveredCell(table, 0, 0)).toBe(false) // the anchor
    expect(isCoveredCell(table, 0, 1)).toBe(true) // covered
    expect(mergeCovering(table, 0, 1).colspan).toBe(2)
    // The anchor's box spans both columns.
    expect(cellSpanBox(table, 0, 0)).toEqual({ x: 0, y: 0, w: 200, h: 40 })
  })

  it('drops a merge that a new overlapping merge replaces', () => {
    const table = base()
    mergeTableCells(table, 0, 0, 0, 1)
    mergeTableCells(table, 0, 1, 1, 1) // overlaps the first at (0,1)
    expect(table.merges).toHaveLength(1)
    expect(table.merges[0]).toEqual({ row: 0, col: 1, rowspan: 2, colspan: 1 })
  })

  it('splits a merged cell from any cell it covers', () => {
    const table = base()
    mergeTableCells(table, 1, 1, 2, 2)
    unmergeTableCell(table, 2, 2) // a covered cell, not the anchor
    expect(table.merges).toHaveLength(0)
  })

  it('bounds the merges list so an untrusted document cannot blow up coverage checks', () => {
    const flood = Array.from({ length: 100000 }, () => ({ row: 0, col: 0, rowspan: 1, colspan: 1 }))
    expect(tableMerges({ ...base(), merges: flood }).length).toBeLessThanOrEqual(MAX_TABLE_DIM * MAX_TABLE_DIM)
  })
})

describe('contrastInk', () => {
  it('uses dark ink on light fills and light ink on dark fills', () => {
    expect(contrastInk('#FFF7D3')).toBe('#171717')
    expect(contrastInk('#171717')).toBe('#FFFFFF')
  })
})

describe('strokeOpacity (#409)', () => {
  // The one function the canvas, the export, the thumbnail and the minimap all
  // read, so a stroke cannot look different depending on what is painting it.
  it('prefers the stroke’s own value', () => {
    expect(strokeOpacity({ kind: 'highlighter', opacity: 0.9 })).toBe(0.9)
    expect(strokeOpacity({ kind: 'pen', opacity: 0 })).toBe(0)
  })

  it('falls back to the ink default for a stroke saved without one', () => {
    expect(strokeOpacity({ kind: 'highlighter' })).toBe(HIGHLIGHTER_OPACITY)
    expect(strokeOpacity({ kind: 'pen' })).toBe(PEN_OPACITY)
  })

  it('refuses anything that is not a real number in range', () => {
    // The value reaches an SVG attribute in the export, so a saved document must
    // not be able to put arbitrary text — or a NaN — into it.
    expect(strokeOpacity({ kind: 'pen', opacity: '" onload="alert(1)' })).toBe(PEN_OPACITY)
    expect(strokeOpacity({ kind: 'pen', opacity: NaN })).toBe(PEN_OPACITY)
    expect(strokeOpacity({ kind: 'pen', opacity: Infinity })).toBe(PEN_OPACITY)
    expect(strokeOpacity({ kind: 'pen', opacity: 4 })).toBe(1)
    expect(strokeOpacity({ kind: 'pen', opacity: -2 })).toBe(0)
  })
})

describe('table cell formatting (#344)', () => {
  const table = () => makeTable(0, 0, { rows: 2, cols: 2 })

  it('reads a legacy plain-text cell as one unformatted run', () => {
    const t = table()
    setTableCell(t, 0, 0, 'Revenue')
    expect(tableCellRuns(t, 0, 0)).toEqual([{ text: 'Revenue' }])
  })

  it('keeps cells as the plain-text source of truth when runs are written', () => {
    const t = table()
    setTableCellRuns(t, 0, 1, [{ text: 'Q1 ' }, { text: 'total', bold: true }])
    expect(t.cells['0,1']).toBe('Q1 total')
    expect(tableCellRuns(t, 0, 1)).toHaveLength(2)
  })

  // A plain cell must add nothing to the document, so old clients see no change.
  it('stores no runs entry for a cell with no formatting', () => {
    const t = table()
    setTableCellRuns(t, 0, 0, [{ text: 'plain' }])
    expect(t.cells['0,0']).toBe('plain')
    expect((t.cellRuns || {})['0,0']).toBeUndefined()
  })

  it('drops both entries when a cell is emptied', () => {
    const t = table()
    setTableCellRuns(t, 1, 1, [{ text: 'gone', italic: true }])
    setTableCellRuns(t, 1, 1, [])
    expect(t.cells['1,1']).toBeUndefined()
    expect((t.cellRuns || {})['1,1']).toBeUndefined()
  })

  it('setTableCell clears formatting the cell used to carry', () => {
    const t = table()
    setTableCellRuns(t, 0, 0, [{ text: 'bold', bold: true }])
    setTableCell(t, 0, 0, 'plain again')
    expect((t.cellRuns || {})['0,0']).toBeUndefined()
    expect(tableCellRuns(t, 0, 0)).toEqual([{ text: 'plain again' }])
  })

  // Runs that disagree with the plain string mean a partly-migrated or hand-
  // edited document; the text must win so no character is ever lost on screen.
  it('ignores runs that no longer match the cell text', () => {
    const t = table()
    setTableCellRuns(t, 0, 0, [{ text: 'stale', bold: true }])
    t.cells = { ...t.cells, '0,0': 'edited elsewhere' }
    expect(tableCellRuns(t, 0, 0)).toEqual([{ text: 'edited elsewhere' }])
  })

  it('treats a missing cell as no runs', () => {
    expect(tableCellRuns(table(), 1, 0)).toEqual([])
  })
})

// #508: a table cell gets the same text options a text box has. Colour and
// alignment used to live on the TABLE only, so "this cell in red" was impossible.
// Vibhav's call (16 Aug 2026): per cell, with the table's value as the default an
// untouched cell follows — not per cell only, which would mean restyling a whole
// table cell by cell.
describe('per-cell text style (#508)', () => {
  const table = () => makeTable(0, 0, { rows: 2, cols: 2, color: '#171717', align: 'left' })

  it('falls back to the table for a cell that has no style of its own', () => {
    const style = tableCellStyle(table(), 0, 0)
    expect(style).toEqual({
      color: '#171717',
      align: 'left',
      size: TABLE_FONT_SIZE,
      font: ESPRESSO_SANS,
      fill: 'none',
      border: { color: '#E6E6EA', width: 1, dash: 'solid' },
    })
  })

  it('follows the table when the table changes, for an untouched cell', () => {
    const model = table()
    model.color = '#E03636'
    expect(tableCellStyle(model, 0, 0).color).toBe('#E03636')
  })

  it('lets one cell override without touching its neighbours', () => {
    const model = table()
    setTableCellStyle(model, 0, 0, { color: '#E03636', align: 'center' })
    expect(tableCellStyle(model, 0, 0)).toMatchObject({ color: '#E03636', align: 'center' })
    expect(tableCellStyle(model, 0, 1)).toMatchObject({ color: '#171717', align: 'left' })
  })

  it('keeps an override when the table changes under it', () => {
    // The point of an override: "red" means red, not "red until the table moves".
    const model = table()
    setTableCellStyle(model, 1, 1, { color: '#E03636' })
    model.color = '#0289F7'
    expect(tableCellStyle(model, 1, 1).color).toBe('#E03636')
  })

  it('clears one field with null, sending that cell back to following', () => {
    const model = table()
    setTableCellStyle(model, 0, 0, { color: '#E03636', size: 20 })
    setTableCellStyle(model, 0, 0, { color: null })
    expect(tableCellStyle(model, 0, 0).color).toBe('#171717')
    expect(tableCellStyle(model, 0, 0).size).toBe(20)
  })

  // #556: font, fill and border follow the same per-cell-override-else-table
  // pattern as color/align/size, and a flat cell override cannot drop a sibling
  // border field the way a nested patch could (setTableCellStyle writes each key
  // shallowly).
  it('lets one cell override its font, fill and border independently', () => {
    const model = table()
    setTableCellStyle(model, 0, 0, { font: 'ui-monospace, monospace', fill: '#EFF6FF', borderColor: '#8FBEF5' })
    const style = tableCellStyle(model, 0, 0)
    expect(style.font).toBe('ui-monospace, monospace')
    expect(style.fill).toBe('#EFF6FF')
    expect(style.border).toEqual({ color: '#8FBEF5', width: 1, dash: 'solid' })
  })

  it('keeps a border colour override after a later border-width-only patch', () => {
    const model = table()
    setTableCellStyle(model, 0, 0, { borderColor: '#8FBEF5' })
    setTableCellStyle(model, 0, 0, { borderWidth: 2 })
    const style = tableCellStyle(model, 0, 0)
    expect(style.border.color).toBe('#8FBEF5')
    expect(style.border.width).toBe(2)
  })

  it('follows the table default border when the table sets one', () => {
    const model = table()
    model.border = { color: '#171717', width: 2, dash: 'dashed' }
    expect(tableCellStyle(model, 0, 0).border).toEqual({ color: '#171717', width: 2, dash: 'dashed' })
  })

  it('stores nothing for a table nobody has restyled', () => {
    // Sparse, so an untouched table adds no weight to the saved document.
    const model = table()
    expect(model.cellStyles).toBeUndefined()
    setTableCellStyle(model, 0, 0, { color: '#E03636' })
    setTableCellStyle(model, 0, 0, { color: null })
    expect(model.cellStyles).toBeUndefined()
  })
})

// #501: a sticky's text gets the same options a text box has. It stored a plain
// string and a note-wide `strike` boolean, so "half of this struck through" could
// not be said — and neither could bold, a size, an alignment or a text colour.
//
// The migration decision (Vibhav, 16 Aug 2026): an existing `strike: true` KEEPS
// its strike, as a mark across the whole text. Nothing is rewritten on open.
describe('sticky note rich text (#501)', () => {
  const note = (partial = {}) => makeStickyNote(0, 0, { text: 'hello', ...partial })
  // A legacy note arrives by deserialising a saved document, not from the factory —
  // makeStickyNote deliberately does not carry the retired flag, so a NEW note can
  // never have one.
  const legacyNote = () => ({ ...note(), strike: true })

  it('reads plain text as one unmarked run', () => {
    expect(stickyRuns(note())).toEqual([{ text: 'hello' }])
  })

  it('migrates a legacy note-wide strike to a mark across the whole text', () => {
    expect(stickyRuns(legacyNote())).toEqual([{ text: 'hello', strike: true }])
  })

  it('does not rewrite the stored note just by reading it', () => {
    // Opening a document must not modify it; the migration is a read-time view
    // until the user edits.
    const legacy = legacyNote()
    stickyRuns(legacy)
    expect(legacy.strike).toBe(true)
    expect(legacy.runs).toBeUndefined()
  })

  it('never gives a NEW note the retired flag', () => {
    expect(note()).not.toHaveProperty('strike')
  })

  it('drops the legacy flag once real marks are written', () => {
    // Otherwise the boolean would keep re-striking text the user just un-struck.
    const legacy = legacyNote()
    setStickyRuns(legacy, [{ text: 'hello' }])
    expect(legacy.strike).toBeUndefined()
    expect(stickyRuns(legacy)).toEqual([{ text: 'hello' }])
  })

  it('keeps the plain text as the source of truth', () => {
    const marked = note()
    setStickyRuns(marked, [{ text: 'he', bold: true }, { text: 'llo' }])
    expect(marked.text).toBe('hello')
    expect(marked.runs).toHaveLength(2)
  })

  it('stores no runs for a note carrying no marks', () => {
    const plain = note()
    setStickyRuns(plain, [{ text: 'hello' }])
    expect(plain.runs).toBeUndefined()
  })

  it('prefers the plain text when the two disagree', () => {
    // A hand-edited or partly-migrated document must render what it says, not
    // stale runs describing different words.
    const drifted = note({ text: 'changed', runs: [{ text: 'hello', bold: true }] })
    expect(stickyRuns(drifted)).toEqual([{ text: 'changed' }])
  })
})

describe('sticky note text style (#501)', () => {
  const note = (partial = {}) => makeStickyNote(0, 0, { color: '#FFF7D3', ...partial })

  it('defaults the colour to the auto-contrast ink for the paper', () => {
    // A note nobody has restyled looks exactly as it always did.
    expect(stickyTextStyle(note()).color).toBe(contrastInk('#FFF7D3'))
  })

  it('defaults size and alignment', () => {
    const style = stickyTextStyle(note())
    expect(style.size).toBe(STICKY_TEXT_SIZE)
    expect(style.align).toBe('left')
  })

  it('keeps the note’s own paper colour separate from its ink', () => {
    const restyled = note()
    setStickyTextStyle(restyled, { color: '#E03636' })
    expect(stickyTextStyle(restyled).color).toBe('#E03636')
    expect(restyled.color, 'the paper changed with the ink').toBe('#FFF7D3')
  })

  it('clears one field with null and stores nothing when empty', () => {
    const restyled = note()
    setStickyTextStyle(restyled, { size: 20, align: 'center' })
    setStickyTextStyle(restyled, { size: null, align: null })
    expect(restyled.textStyle).toBeUndefined()
  })
})
