import { describe, it, expect } from 'vitest'
import { ERASER_SIZES, eraseInkAt, eraseObjectsAt, sweepPoints } from './eraser.js'
import { makeLine, makeStickyNote, makeStroke, makeTable } from './whiteboardModel.js'

// The eraser's model surgery (issue #39): the ink eraser must clear a stroke in
// ONE pass (no leftover slivers), and the object eraser must take whole elements —
// including the lines, tables, shapes and connectors the old eraser slid over.

// A horizontal stroke from x=0 to x=100 at y=0, sampled every 10 units.
function horizontalStroke(partial = {}) {
  const points = []
  for (let x = 0; x <= 100; x += 10) points.push({ x, y: 0 })
  return makeStroke(points, { width: 2, ...partial })
}

describe('sweepPoints', () => {
  it('walks the gap between two pointer samples in half-tip steps', () => {
    const points = sweepPoints({ x: 0, y: 0 }, { x: 40, y: 0 }, 10)
    expect(points.length).toBe(8) // 40 units / (10/2) per step
    expect(points[points.length - 1]).toEqual({ x: 40, y: 0 })
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i].x - points[i - 1].x).toBeLessThanOrEqual(5)
    }
  })

  it('always emits the destination, even when the pointer barely moved', () => {
    expect(sweepPoints({ x: 3, y: 3 }, { x: 3, y: 3 }, 14)).toEqual([{ x: 3, y: 3 }])
  })

  it('caps the samples for a huge jump so one move cannot stall the frame', () => {
    expect(sweepPoints({ x: 0, y: 0 }, { x: 100000, y: 0 }, 6).length).toBe(64)
  })
})

describe('eraseInkAt', () => {
  it('splits a stroke into the sub-paths that survive around the tip', () => {
    const model = { strokes: [horizontalStroke()], lines: [] }
    expect(eraseInkAt(model, { x: 50, y: 0 }, 10)).toBe(true)
    expect(model.strokes.length).toBe(2)
    const [left, right] = model.strokes
    expect(Math.max(...left.points.map((p) => p.x))).toBeLessThanOrEqual(39)
    expect(Math.min(...right.points.map((p) => p.x))).toBeGreaterThanOrEqual(61)
  })

  it('keeps the erased stroke’s ink strength on the pieces that survive', () => {
    // The survivors are new stroke objects (#409): a faint highlighter rubbed in
    // the middle must not leave two full-strength halves behind.
    const model = { strokes: [horizontalStroke({ kind: 'highlighter', opacity: 0.25 })], lines: [] }
    expect(eraseInkAt(model, { x: 50, y: 0 }, 10)).toBe(true)
    expect(model.strokes.length).toBe(2)
    for (const piece of model.strokes) expect(piece.opacity).toBe(0.25)
  })

  it('clips the tip of a stroke when only its last segment is caught', () => {
    // Regression: the "untouched" shortcut used to compare point COUNTS, and
    // clipping one end swaps the erased endpoint for a boundary point — same
    // count, so the original stroke was restored and its tip never erased.
    const model = { strokes: [makeStroke([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }], { width: 2 })], lines: [] }
    expect(eraseInkAt(model, { x: 18, y: 0 }, 5)).toBe(true)
    expect(model.strokes.length).toBe(1)
    const kept = model.strokes[0].points
    expect(Math.max(...kept.map((p) => p.x))).toBeLessThan(20)
  })

  it('clips the head of a stroke when only its first segment is caught', () => {
    const model = { strokes: [makeStroke([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }], { width: 2 })], lines: [] }
    expect(eraseInkAt(model, { x: 2, y: 0 }, 5)).toBe(true)
    expect(Math.min(...model.strokes[0].points.map((p) => p.x))).toBeGreaterThan(0)
  })

  it('keeps a stroke the tip only grazes tangentially — nothing is under it', () => {
    const stroke = horizontalStroke()
    const model = { strokes: [stroke], lines: [] }
    // Tip radius + half the stroke width exactly reaches the path: it touches at
    // one point, so there is no ink to remove and the original object survives.
    expect(eraseInkAt(model, { x: 50, y: 11 }, 10)).toBe(false)
    expect(model.strokes[0]).toBe(stroke)
  })

  it('removes a stroke that lies entirely under the tip', () => {
    const model = { strokes: [makeStroke([{ x: 0, y: 0 }, { x: 4, y: 0 }])], lines: [] }
    expect(eraseInkAt(model, { x: 2, y: 0 }, 30)).toBe(true)
    expect(model.strokes).toEqual([])
  })

  it('leaves untouched ink alone and reports no change', () => {
    const stroke = horizontalStroke()
    const model = { strokes: [stroke], lines: [] }
    expect(eraseInkAt(model, { x: 50, y: 500 }, 10)).toBe(false)
    expect(model.strokes[0]).toBe(stroke)
  })

  it('takes a straight line whole — a line has no partial form (#39)', () => {
    const model = { strokes: [], lines: [makeLine(0, 0, 100, 0), makeLine(0, 200, 100, 200)] }
    expect(eraseInkAt(model, { x: 50, y: 4 }, 10)).toBe(true)
    expect(model.lines.length).toBe(1)
    expect(model.lines[0].y1).toBe(200)
  })

  it('clears a stroke in one fast pass, leaving no fragments between samples', () => {
    // A drag sampled ~50 units apart: erasing only the disk under each sample used
    // to leave ink in the gaps, which is what the bug report showed.
    const model = { strokes: [horizontalStroke()], lines: [] }
    let point = { x: -20, y: 0 }
    for (const next of [{ x: 30, y: 0 }, { x: 80, y: 0 }, { x: 130, y: 0 }]) {
      for (const sample of sweepPoints(point, next, ERASER_SIZES[1])) {
        eraseInkAt(model, sample, ERASER_SIZES[1])
      }
      point = next
    }
    expect(model.strokes).toEqual([])
  })
})

describe('eraseObjectsAt', () => {
  const shape = { id: 's1', type: 'rectangle', x: 200, y: 200, w: 100, h: 60 }

  function state() {
    return {
      shapes: [shape],
      connectors: [{ id: 'c1', from: { x: 0, y: 400 }, to: { x: 100, y: 400 } }],
      whiteboard: {
        strokes: [horizontalStroke()],
        lines: [makeLine(0, 100, 100, 100)],
        tables: [makeTable(400, 0, { rows: 3, cols: 3 })],
        stickyNotes: [makeStickyNote(700, 0)],
      },
    }
  }

  it('takes the whole stroke under the tip, not just the ink it covers', () => {
    const doc = state()
    const id = doc.whiteboard.strokes[0].id
    expect(eraseObjectsAt(doc, { x: 50, y: 0 }, 10)).toEqual([{ kind: 'stroke', id }])
    expect(doc.whiteboard.strokes).toEqual([])
  })

  it('takes lines, tables and sticky notes — the objects the ink eraser cannot', () => {
    const doc = state()
    expect(eraseObjectsAt(doc, { x: 50, y: 100 }, 6)[0].kind).toBe('line')
    expect(eraseObjectsAt(doc, { x: 420, y: 20 }, 6)[0].kind).toBe('table')
    expect(eraseObjectsAt(doc, { x: 720, y: 20 }, 6)[0].kind).toBe('sticky')
    expect(doc.whiteboard.lines).toEqual([])
    expect(doc.whiteboard.tables).toEqual([])
    expect(doc.whiteboard.stickyNotes).toEqual([])
  })

  it('takes base shapes and connectors (#39: a connector was un-erasable)', () => {
    const doc = state()
    expect(eraseObjectsAt(doc, { x: 250, y: 230 }, 6)).toEqual([{ kind: 'shape', id: 's1' }])
    expect(eraseObjectsAt(doc, { x: 50, y: 402 }, 6)).toEqual([{ kind: 'connector', id: 'c1' }])
    expect(doc.shapes).toEqual([])
    expect(doc.connectors).toEqual([])
  })

  it('resolves an attached connector endpoint against its shape', () => {
    const doc = state()
    doc.connectors = [{ id: 'c2', from: { shapeId: 's1', anchor: 'left' }, to: { x: 0, y: 230 } }]
    expect(eraseObjectsAt(doc, { x: 100, y: 230 }, 6)).toEqual([{ kind: 'connector', id: 'c2' }])
  })

  it('leaves hidden and locked shapes alone, like the select tool', () => {
    const doc = state()
    doc.shapes = [{ ...shape, hidden: true }, { ...shape, id: 's2', locked: true }]
    expect(eraseObjectsAt(doc, { x: 250, y: 230 }, 6)).toEqual([])
    expect(doc.shapes.length).toBe(2)
  })

  it('does not add object lists an older document never had', () => {
    const doc = { shapes: [], connectors: [], whiteboard: { strokes: [], stickyNotes: [] } }
    expect(eraseObjectsAt(doc, { x: 0, y: 0 }, 10)).toEqual([])
    expect('lines' in doc.whiteboard).toBe(false)
    expect('tables' in doc.whiteboard).toBe(false)
  })

  it('reports nothing and keeps the arrays when the tip misses everything', () => {
    const doc = state()
    const strokes = doc.whiteboard.strokes
    expect(eraseObjectsAt(doc, { x: -500, y: -500 }, 6)).toEqual([])
    expect(doc.whiteboard.strokes).toBe(strokes)
  })
})
