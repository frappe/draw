import { describe, it, expect } from 'vitest'
import { distanceToSegment, unionBounds, maxOf, minOf } from './geometry.js'

// These replace the `Math.min/max(...array)` idiom used all over the canvas to box
// a selection or content. Spreading a large array into Math.min/max throws
// RangeError ("too many function arguments"), so a select-all of tens of thousands
// of objects would crash the selection toolbar / fit-to-view. The loop cannot.
describe('unionBounds', () => {
  it('unions {x,y,w,h} boxes into one enclosing box', () => {
    const boxes = [
      { x: 10, y: 20, w: 30, h: 40 }, // right/bottom: 40, 60
      { x: 0, y: 5, w: 5, h: 5 }, // left/top: 0, 5
    ]
    expect(unionBounds(boxes)).toEqual({ x: 0, y: 5, w: 40, h: 55 })
  })

  it('returns null for an empty list', () => {
    expect(unionBounds([])).toBeNull()
  })

  it('does not throw on a very large list (the RangeError the spread would hit)', () => {
    const boxes = Array.from({ length: 200_000 }, (_, i) => ({ x: i, y: -i, w: 1, h: 2 }))
    const box = unionBounds(boxes)
    expect(box).toEqual({ x: 0, y: -199_999, w: 200_000, h: 200_001 })
  })
})

describe('maxOf / minOf', () => {
  it('find the extremes of a list', () => {
    expect(maxOf([3, 9, 1, 7])).toBe(9)
    expect(minOf([3, 9, 1, 7])).toBe(1)
  })

  it('return the fallback for an empty list', () => {
    expect(maxOf([], 42)).toBe(42)
    expect(minOf([], 42)).toBe(42)
  })

  it('handle a very large list without spreading', () => {
    const values = Array.from({ length: 200_000 }, (_, i) => i)
    expect(maxOf(values)).toBe(199_999)
    expect(minOf(values)).toBe(0)
  })
})

// Stroke simplification, eraser/line hit-testing and flowchart edge picking all
// measure through this. The clamping behaviour is what separates it from
// distance-to-infinite-line: a point past an endpoint measures to the endpoint.
describe('distanceToSegment', () => {
  const a = { x: 0, y: 0 }
  const b = { x: 10, y: 0 }

  it('measures perpendicular distance to a point above the segment', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, a, b)).toBe(3)
  })

  it('returns zero on the segment', () => {
    expect(distanceToSegment({ x: 4, y: 0 }, a, b)).toBe(0)
  })

  it('clamps past the end points instead of measuring to the infinite line', () => {
    // 3 to the left of `a`, 4 above -> 5 by Pythagoras, not the 4 an unclamped
    // perpendicular would report.
    expect(distanceToSegment({ x: -3, y: 4 }, a, b)).toBe(5)
    expect(distanceToSegment({ x: 13, y: -4 }, a, b)).toBe(5)
  })

  it('handles a zero-length segment as distance to that point', () => {
    expect(distanceToSegment({ x: 3, y: 4 }, a, { x: 0, y: 0 })).toBe(5)
  })
})
