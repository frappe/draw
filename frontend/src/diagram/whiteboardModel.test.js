import { describe, it, expect } from 'vitest'
import {
  createWhiteboard,
  addStroke,
  removeStroke,
  addStickyNote,
  distanceToStroke,
  strokeAt,
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

describe('contrastInk', () => {
  it('uses dark ink on light fills and light ink on dark fills', () => {
    expect(contrastInk('#FFF7D3')).toBe('#171717')
    expect(contrastInk('#171717')).toBe('#FFFFFF')
  })
})
