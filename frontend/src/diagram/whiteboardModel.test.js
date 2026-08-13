import { describe, it, expect } from 'vitest'
import {
  createWhiteboard,
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
