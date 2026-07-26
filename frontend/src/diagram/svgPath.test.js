import { describe, it, expect } from 'vitest'
import { pointsToPath } from './svgPath.js'

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
})
