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
} from './whiteboardModel.js'
import { contrastInk } from './whiteboardColors.js'

describe('whiteboard model', () => {
  it('adds and removes strokes with stable ids', () => {
    const model = createWhiteboard()
    const id = addStroke(model, [{ x: 0, y: 0 }, { x: 10, y: 0 }], { color: '#000', width: 4 })
    expect(model.strokes).toHaveLength(1)
    expect(model.strokes[0].id).toBe(id)
    removeStroke(model, id)
    expect(model.strokes).toHaveLength(0)
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
