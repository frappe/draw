import { describe, it, expect } from 'vitest'
import { pointsToPath, smoothPath } from './svgPath.js'

describe('pointsToPath', () => {
  it('emits M for the first point and L for the rest', () => {
    const d = pointsToPath([
      { x: 0, y: 0 },
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ])
    expect(d).toBe('M 0 0 L 10 20 L 30 40')
  })

  it('closes the path with Z only when asked', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
    ]
    expect(pointsToPath(points, true)).toBe('M 0 0 L 5 5 Z')
    expect(pointsToPath(points)).toBe('M 0 0 L 5 5')
  })

  it('returns an empty string for an empty path so callers can bind it directly', () => {
    expect(pointsToPath([])).toBe('')
  })

  // Whiteboard stroke points are persisted values, and useThumbnail builds its SVG by
  // string concatenation for markup that is injected into a viewer's DOM — so a
  // non-numeric coordinate must not survive into the `d` attribute.
  it('coerces a non-numeric coordinate to zero instead of interpolating it', () => {
    const d = pointsToPath([{ x: '0"/><script>alert(1)</script><path d="0', y: 0 }, { x: 5, y: undefined }])
    expect(d).toBe('M 0 0 L 5 0')
  })
})

// Freehand strokes render through this instead of pointsToPath (#426): straight
// segments between captured points are what made every stroke read as angular.
describe('smoothPath', () => {
  it('draws a quadratic per interior point, ending at the midpoint to its neighbour', () => {
    const d = smoothPath([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
    ])
    // One interior point (10,10): control there, end at the midpoint to (20,0).
    expect(d).toBe('M 0 0 Q 10 10 15 5 L 20 0')
  })

  it('keeps both ends of the stroke exactly where they were drawn', () => {
    const points = [
      { x: 4, y: 4 },
      { x: 9, y: 30 },
      { x: 40, y: 12 },
      { x: 61, y: 7 },
    ]
    const d = smoothPath(points)
    expect(d.startsWith('M 4 4 ')).toBe(true)
    expect(d.endsWith('L 61 7')).toBe(true)
  })

  // Below three points there is no interior to curve through, so it defers to the
  // straight builder — asserted against that builder rather than against a copy of
  // its output, which would pin its formatting here as well.
  it('falls back to a straight path when there is no interior to curve through', () => {
    for (const points of [[{ x: 1, y: 2 }, { x: 3, y: 4 }], [{ x: 1, y: 2 }], []]) {
      expect(smoothPath(points)).toBe(pointsToPath(points))
    }
    expect(smoothPath(null)).toBe('')
  })

  // Same reasoning as pointsToPath: these coordinates are persisted values that
  // reach a `d` attribute in markup injected into a viewer's DOM.
  it('coerces a non-numeric coordinate rather than interpolating it', () => {
    const d = smoothPath([
      { x: '"/><script>alert(1)</script>', y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
    ])
    expect(d).not.toContain('<script>')
    expect(d).toBe('M 0 0 Q 10 10 15 5 L 20 0')
  })
})
