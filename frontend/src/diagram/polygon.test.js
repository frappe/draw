import { describe, it, expect } from 'vitest'
import {
  buildPolygonShape,
  polygonPointsString,
  polygonBBox,
  isNearFirstVertex,
  canClosePolygon,
  MIN_POLYGON_VERTICES,
} from './polygon.js'

// A right triangle whose extent is a neat 100x80 box at (10,20), so the normalised
// values are exact fractions.
const TRIANGLE = [
  { x: 10, y: 20 },
  { x: 110, y: 20 },
  { x: 10, y: 100 },
]

describe('polygonBBox', () => {
  it('derives the axis-aligned extent from raw vertices', () => {
    expect(polygonBBox(TRIANGLE)).toEqual({ x: 10, y: 20, w: 100, h: 80 })
  })

  it('floors a collapsed axis at 1 so a vertical polygon never divides by zero', () => {
    const vertical = [{ x: 5, y: 0 }, { x: 5, y: 40 }, { x: 5, y: 80 }]
    expect(polygonBBox(vertical)).toEqual({ x: 5, y: 0, w: 1, h: 80 })
  })

  it('returns a zero box at the origin for no points', () => {
    expect(polygonBBox([])).toEqual({ x: 0, y: 0, w: 0, h: 0 })
  })
})

describe('buildPolygonShape', () => {
  it('stores type, the extent box, and points normalised to it', () => {
    const shape = buildPolygonShape(TRIANGLE)
    expect(shape).toMatchObject({ type: 'polygon', x: 10, y: 20, w: 100, h: 80 })
    // (10,20)->(0,0), (110,20)->(1,0), (10,100)->(0,1).
    expect(shape.points).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ])
  })

  it('round-trips: normalised points scale back to the exact drawn coordinates', () => {
    const shape = buildPolygonShape(TRIANGLE)
    expect(polygonPointsString(shape)).toBe('10,20 110,20 10,100')
  })

  it('rejects fewer than three vertices (nothing to close)', () => {
    expect(buildPolygonShape([{ x: 0, y: 0 }, { x: 10, y: 10 }])).toBeNull()
    expect(MIN_POLYGON_VERTICES).toBe(3)
  })

  it('drops a near-duplicate trailing vertex (a double-click closes cleanly)', () => {
    // A double-click's second press lands on ~the same spot as the third vertex, so
    // the raw list has four points but only three distinct ones.
    const withDup = [...TRIANGLE, { x: 10.4, y: 100.3 }]
    const shape = buildPolygonShape(withDup, 1)
    expect(shape.points).toHaveLength(3)
  })

  it('still rejects when de-duplication drops the list below three', () => {
    const collapsed = [{ x: 0, y: 0 }, { x: 0.2, y: 0.1 }, { x: 0.1, y: 0.2 }]
    expect(buildPolygonShape(collapsed, 1)).toBeNull()
  })
})

describe('polygonPointsString', () => {
  it('scales normalised points onto the shape box', () => {
    const shape = { x: 0, y: 0, w: 200, h: 100, points: [{ x: 0, y: 0 }, { x: 0.5, y: 1 }, { x: 1, y: 0 }] }
    expect(polygonPointsString(shape)).toBe('0,0 100,100 200,0')
  })

  it('follows the box after a move (x/y shift every point)', () => {
    const shape = { x: 50, y: 30, w: 200, h: 100, points: [{ x: 0, y: 0 }, { x: 0.5, y: 1 }, { x: 1, y: 0 }] }
    expect(polygonPointsString(shape)).toBe('50,30 150,130 250,30')
  })

  it('follows the box after a resize (w/h scale every point)', () => {
    const shape = { x: 0, y: 0, w: 400, h: 200, points: [{ x: 0, y: 0 }, { x: 0.5, y: 1 }, { x: 1, y: 0 }] }
    expect(polygonPointsString(shape)).toBe('0,0 200,200 400,0')
  })

  it('is empty when the shape carries no points', () => {
    expect(polygonPointsString({ x: 0, y: 0, w: 10, h: 10, points: [] })).toBe('')
    expect(polygonPointsString({ x: 0, y: 0, w: 10, h: 10 })).toBe('')
  })
})

describe('isNearFirstVertex (snap-to-close)', () => {
  const first = { x: 100, y: 100 }

  it('is true within the radius', () => {
    expect(isNearFirstVertex({ x: 106, y: 108 }, first, 10)).toBe(true) // dist 10
  })

  it('is false outside the radius', () => {
    expect(isNearFirstVertex({ x: 120, y: 100 }, first, 10)).toBe(false) // dist 20
  })

  it('is false without a point or first vertex', () => {
    expect(isNearFirstVertex(null, first, 10)).toBe(false)
    expect(isNearFirstVertex({ x: 0, y: 0 }, null, 10)).toBe(false)
  })
})

describe('canClosePolygon', () => {
  it('needs at least three distinct vertices', () => {
    expect(canClosePolygon(TRIANGLE)).toBe(true)
    expect(canClosePolygon(TRIANGLE.slice(0, 2))).toBe(false)
  })

  it('counts distinct vertices, not near-duplicates', () => {
    const twoDistinct = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50.2, y: 0.1 }]
    expect(canClosePolygon(twoDistinct, 1)).toBe(false)
  })
})
