import { describe, it, expect } from 'vitest'
import { distanceToSegment } from './geometry.js'

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
