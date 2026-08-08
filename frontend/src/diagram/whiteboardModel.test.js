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

describe('contrastInk', () => {
  it('uses dark ink on light fills and light ink on dark fills', () => {
    expect(contrastInk('#FFF7D3')).toBe('#171717')
    expect(contrastInk('#171717')).toBe('#FFFFFF')
  })
})
