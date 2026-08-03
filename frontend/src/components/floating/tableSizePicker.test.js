import { describe, it, expect } from 'vitest'
import {
  MAX_TABLE_ROWS,
  MAX_TABLE_COLS,
  isCellFilled,
  sizeReadout,
  clampDimension,
  tableInsertOrigin,
} from './tableSizePicker.js'
import { makeTable, tableWidth, tableHeight, TABLE_CELL_W, TABLE_CELL_H } from '@/diagram/whiteboardModel.js'

describe('table size picker logic', () => {
  it('offers a grid of up to 8×8 (#134 "support up to ~8×8")', () => {
    expect(MAX_TABLE_ROWS).toBe(8)
    expect(MAX_TABLE_COLS).toBe(8)
    expect(isCellFilled(8, 8, 8, 8)).toBe(true)
  })

  it('fills exactly the top-left rows×cols block the pointer spans', () => {
    // Hovering the cell at row 2, col 3 spans a 2×3 block.
    const [rows, cols] = [2, 3]
    expect(isCellFilled(1, 1, rows, cols)).toBe(true) // top-left corner
    expect(isCellFilled(2, 3, rows, cols)).toBe(true) // the hovered cell itself
    expect(isCellFilled(3, 3, rows, cols)).toBe(false) // one row past
    expect(isCellFilled(2, 4, rows, cols)).toBe(false) // one column past
  })

  it('reads out the hovered size rows-first as "R × C"', () => {
    // Hovering cell (r, c) sets the size to r rows by c cols; the readout mirrors it.
    expect(sizeReadout(1, 1)).toBe('1 × 1')
    expect(sizeReadout(2, 5)).toBe('2 × 5')
    expect(sizeReadout(8, 8)).toBe('8 × 8')
  })

  it('clamps keyboard steps into the grid', () => {
    expect(clampDimension(0, MAX_TABLE_ROWS)).toBe(1) // never below 1
    expect(clampDimension(9, MAX_TABLE_COLS)).toBe(8) // never past the max
    expect(clampDimension(4, MAX_TABLE_COLS)).toBe(4)
  })

  it('centres a picked table in the visible rect', () => {
    const view = { x: 0, y: 0, w: 1000, h: 600 }
    const origin = tableInsertOrigin(view, 2, 4)
    // 4 cols × 120 = 480 wide, 2 rows × 40 = 80 tall, centred in 1000×600.
    expect(origin).toEqual({ x: (1000 - 480) / 2, y: (600 - 80) / 2 })
  })

  it('a picked rows×cols produces a table model of exactly that size', () => {
    for (const [rows, cols] of [[1, 1], [2, 5], [8, 8], [4, 3]]) {
      const table = makeTable(0, 0, { rows, cols })
      expect(table.rows).toBe(rows)
      expect(table.cols).toBe(cols)
      // Grid dimensions come from the pick; the cell box keeps its defaults.
      expect(table.cellW).toBe(TABLE_CELL_W)
      expect(table.cellH).toBe(TABLE_CELL_H)
      expect(tableWidth(table)).toBe(cols * TABLE_CELL_W)
      expect(tableHeight(table)).toBe(rows * TABLE_CELL_H)
    }
  })

  it('no longer falls back to a fixed 3×3 when a size is given', () => {
    const table = makeTable(0, 0, { rows: 2, cols: 6 })
    expect([table.rows, table.cols]).toEqual([2, 6])
  })
})
