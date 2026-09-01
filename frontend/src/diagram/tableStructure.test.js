// Structural table edits (#553): a row/column insert or delete has to carry the
// cell text, its runs, its style overrides, the merges and the dragged sizes
// with it — these lock that down, plus the header-row rule.
import { describe, it, expect } from 'vitest'
import { makeTable, tableCellRuns, tableCellStyle, colWidthsOf, rowHeightsOf, setTableCell, MIN_TABLE_CELL } from './whiteboardModel.js'
import {
  insertTableRow,
  deleteTableRow,
  insertTableColumn,
  deleteTableColumn,
  tableHeaderRows,
  isHeaderRow,
  toggleHeaderThroughRow,
  tableHeaderCols,
  isHeaderColumn,
  toggleHeaderThroughColumn,
  clearTableCells,
  wrappedCellLines,
  wrappedCellHeight,
  wrappedCellRunLines,
  autoFitColumnWidth,
  autoFitRowHeight,
} from './tableStructure.js'

function table(partial = {}) {
  return makeTable(0, 0, { rows: 3, cols: 3, ...partial })
}

describe('insertTableRow', () => {
  it('pushes the rows at and below the insert point down', () => {
    const grid = table({ cells: { '0,0': 'top', '1,0': 'middle' } })
    insertTableRow(grid, 1)
    expect(grid.rows).toBe(4)
    expect(grid.cells).toEqual({ '0,0': 'top', '2,0': 'middle' })
  })

  it('carries formatting runs and style overrides with the text', () => {
    const grid = table({
      cells: { '1,1': 'hi' },
      cellRuns: { '1,1': [{ text: 'hi', bold: true }] },
      cellStyles: { '1,1': { color: '#EE5A5A' } },
    })
    insertTableRow(grid, 0)
    expect(tableCellRuns(grid, 2, 1)).toEqual([{ text: 'hi', bold: true }])
    expect(tableCellStyle(grid, 2, 1).color).toBe('#EE5A5A')
  })

  it('grows a merge it lands inside and moves the ones below it', () => {
    const grid = table({ merges: [{ row: 0, col: 0, rowspan: 2, colspan: 1 }] })
    insertTableRow(grid, 1)
    expect(grid.merges).toEqual([{ row: 0, col: 0, rowspan: 3, colspan: 1 }])
    insertTableRow(grid, 0)
    expect(grid.merges).toEqual([{ row: 1, col: 0, rowspan: 3, colspan: 1 }])
  })

  it('splices dragged row heights and leaves un-dragged tables sparse', () => {
    const dragged = table({ rowHeights: [10, 20, 30] })
    insertTableRow(dragged, 1)
    expect(dragged.rowHeights).toEqual([10, dragged.cellH, 20, 30])
    const plain = table()
    insertTableRow(plain, 1)
    expect(plain.rowHeights).toBeUndefined()
  })
})

describe('deleteTableRow', () => {
  it('drops that row and pulls the rows below it up', () => {
    const grid = table({ cells: { '0,0': 'a', '1,0': 'b', '2,0': 'c' } })
    deleteTableRow(grid, 1)
    expect(grid.rows).toBe(2)
    expect(grid.cells).toEqual({ '0,0': 'a', '1,0': 'c' })
  })

  it('keeps the last row', () => {
    const grid = table({ rows: 1 })
    deleteTableRow(grid, 0)
    expect(grid.rows).toBe(1)
  })

  it('shrinks a merge it ran through and drops one left covering a single cell', () => {
    const grid = table({ merges: [{ row: 0, col: 0, rowspan: 2, colspan: 1 }] })
    deleteTableRow(grid, 0)
    expect(grid.merges).toBeUndefined()
  })
})

describe('column edits', () => {
  it('inserts a column, shifting the cells at and past it', () => {
    const grid = table({ cells: { '0,0': 'a', '0,1': 'b' } })
    insertTableColumn(grid, 1)
    expect(grid.cols).toBe(4)
    expect(grid.cells).toEqual({ '0,0': 'a', '0,2': 'b' })
  })

  it('deletes a column, dropping its cells and pulling the rest left', () => {
    const grid = table({ cells: { '0,0': 'a', '0,1': 'b', '0,2': 'c' } })
    deleteTableColumn(grid, 0)
    expect(grid.cols).toBe(2)
    expect(grid.cells).toEqual({ '0,0': 'b', '0,1': 'c' })
  })

  it('keeps the last column', () => {
    const grid = table({ cols: 1 })
    deleteTableColumn(grid, 0)
    expect(grid.cols).toBe(1)
  })
})

describe('header rows', () => {
  it('reads the legacy hasHeader boolean as one header row', () => {
    expect(tableHeaderRows(table({ hasHeader: true }))).toBe(1)
    expect(tableHeaderRows(table())).toBe(0)
  })

  it('makes the header run down to the selected row, and reverts it', () => {
    const grid = table()
    toggleHeaderThroughRow(grid, 1)
    expect(tableHeaderRows(grid)).toBe(2)
    expect(isHeaderRow(grid, 1)).toBe(true)
    expect(grid.hasHeader).toBe(true)
    toggleHeaderThroughRow(grid, 1)
    expect(tableHeaderRows(grid)).toBe(1)
    toggleHeaderThroughRow(grid, 0)
    expect(tableHeaderRows(grid)).toBe(0)
    expect(grid.hasHeader).toBe(false)
  })

  it('follows the rows inserted above or deleted from the header', () => {
    const grid = table({ headerRows: 1 })
    insertTableRow(grid, 0)
    expect(tableHeaderRows(grid)).toBe(2)
    deleteTableRow(grid, 0)
    expect(tableHeaderRows(grid)).toBe(1)
  })
})

describe('header columns', () => {
  it('starts with no header column, unlike rows there is no legacy boolean to read', () => {
    expect(tableHeaderCols(table())).toBe(0)
  })

  it('makes the header run out to the selected column, and reverts it', () => {
    const grid = table()
    toggleHeaderThroughColumn(grid, 1)
    expect(tableHeaderCols(grid)).toBe(2)
    expect(isHeaderColumn(grid, 1)).toBe(true)
    toggleHeaderThroughColumn(grid, 1)
    expect(tableHeaderCols(grid)).toBe(1)
    toggleHeaderThroughColumn(grid, 0)
    expect(tableHeaderCols(grid)).toBe(0)
  })

  it('follows the columns inserted before or deleted from the header', () => {
    const grid = table({ headerCols: 1 })
    insertTableColumn(grid, 0)
    expect(tableHeaderCols(grid)).toBe(2)
    deleteTableColumn(grid, 0)
    expect(tableHeaderCols(grid)).toBe(1)
  })

  it('is independent of the header row', () => {
    const grid = table({ headerRows: 1, headerCols: 1 })
    expect(isHeaderRow(grid, 0)).toBe(true)
    expect(isHeaderColumn(grid, 0)).toBe(true)
    expect(isHeaderRow(grid, 1)).toBe(false)
    expect(isHeaderColumn(grid, 1)).toBe(false)
  })
})

describe('wrappedCellLines / wrappedCellHeight (#556)', () => {
  it('keeps short text on one line', () => {
    expect(wrappedCellLines(200, 'hi', 14)).toEqual(['hi'])
  })

  it('wraps long text across several lines the way stickyText.js wraps a note', () => {
    const lines = wrappedCellLines(60, 'one two three four five', 14)
    expect(lines.length).toBeGreaterThan(1)
    // Every character survives the wrap; only the spaces move.
    expect(lines.join('').replace(/ /g, '')).toBe('onetwothreefourfive')
  })

  it('grows the height with the line count', () => {
    const one = wrappedCellHeight(200, 'hi', 14)
    const many = wrappedCellHeight(60, 'one two three four five', 14)
    expect(many).toBeGreaterThan(one)
  })

  it('keeps a hard line break as its own line even when it would otherwise fit', () => {
    expect(wrappedCellLines(200, 'a\nb', 14)).toEqual(['a', 'b'])
  })

  it('counts a run of consecutive spaces the same way wrappedCellRunLines does, so a row grown by one agrees with what it renders (#557)', () => {
    const text = 'one   two   three   four' // three-space gaps, like the review's repro
    const width = 120
    const grid = table({ cells: { '0,0': text } })
    grid.colWidths = [width, grid.cellW, grid.cellW]
    expect(wrappedCellLines(width, text, 14).length).toBe(wrappedCellRunLines(grid, 0, 0).length)
  })
})

describe('wrappedCellRunLines (#556)', () => {
  it('wraps a cell’s runs, keeping marks on the right characters', () => {
    const grid = table({ cells: { '0,0': 'CELL-TEXT' }, cellRuns: { '0,0': [{ text: 'CELL-TEXT', bold: true }] } })
    // Narrow the column enough to force a wrap.
    grid.colWidths = [40, grid.cellW, grid.cellW]
    const lines = wrappedCellRunLines(grid, 0, 0)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.every((line) => line.every((run) => run.bold === true))).toBe(true)
  })

  it('is one line for a cell that fits', () => {
    const grid = table({ cells: { '0,0': 'hi' } })
    expect(wrappedCellRunLines(grid, 0, 0)).toHaveLength(1)
  })
})

describe('autoFitColumnWidth / autoFitRowHeight (#556)', () => {
  it('never shrinks a column below MIN_TABLE_CELL', () => {
    const grid = table({ cells: { '0,0': 'x' } })
    autoFitColumnWidth(grid, 0)
    expect(colWidthsOf(grid)[0]).toBeGreaterThanOrEqual(MIN_TABLE_CELL)
  })

  it('never shrinks a row below MIN_TABLE_CELL', () => {
    const grid = table({ cells: { '0,0': 'x' } })
    autoFitRowHeight(grid, 0)
    expect(rowHeightsOf(grid)[0]).toBeGreaterThanOrEqual(MIN_TABLE_CELL)
  })

  it('grows the row to fit long wrapped text at the current column width', () => {
    const grid = table()
    grid.colWidths = [40, grid.cellW, grid.cellW]
    setTableCell(grid, 0, 0, 'one two three four five six seven')
    const before = rowHeightsOf(grid)[0]
    autoFitRowHeight(grid, 0)
    expect(rowHeightsOf(grid)[0]).toBeGreaterThan(before)
  })

  it('ignores a cell a merge covers, only measuring the anchor', () => {
    const grid = table({ merges: [{ row: 0, col: 0, rowspan: 1, colspan: 2 }] })
    // Column 1 is covered at row 0; nothing there should blow up or count.
    expect(() => autoFitColumnWidth(grid, 1)).not.toThrow()
  })
})

describe('clearTableCells', () => {
  it('empties the text but keeps the cell style', () => {
    const grid = table({ cells: { '0,0': 'a', '1,1': 'b' }, cellStyles: { '0,0': { color: '#EE5A5A' } } })
    clearTableCells(grid, [{ row: 0, col: 0 }])
    expect(grid.cells['0,0']).toBeUndefined()
    expect(grid.cells['1,1']).toBe('b')
    expect(tableCellStyle(grid, 0, 0).color).toBe('#EE5A5A')
  })
})
