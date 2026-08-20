import { describe, it, expect } from 'vitest'
import { dotDiameter, DOT_MIN, DOT_MAX } from './sizeDot.js'

describe('dotDiameter', () => {
  it('gives the smallest and largest option the row min/max diameter', () => {
    expect(dotDiameter(2, [2, 4, 8])).toBe(DOT_MIN)
    expect(dotDiameter(8, [2, 4, 8])).toBe(DOT_MAX)
  })

  // The bug this fixes: pen's widths (2, 4, 8) are not evenly spaced, so scaling
  // by VALUE put the middle dot only a third of the way up — close to small, a big
  // jump to large. Scaling by INDEX keeps every row's middle option evenly between
  // the other two regardless of how far apart the real widths are.
  it('evenly steps the middle option regardless of how the values are spaced', () => {
    const evenlySpacedMiddle = (DOT_MIN + DOT_MAX) / 2
    expect(dotDiameter(4, [2, 4, 8])).toBe(evenlySpacedMiddle)
    expect(dotDiameter(18, [10, 18, 26])).toBe(evenlySpacedMiddle)
  })

  it('never draws two different options the same size (#498)', () => {
    const sizes = [10, 18, 26]
    const diameters = sizes.map((size) => dotDiameter(size, sizes))
    expect(new Set(diameters).size).toBe(sizes.length)
  })

  it('falls back to the max diameter for a single-option row', () => {
    expect(dotDiameter(5, [5])).toBe(DOT_MAX)
  })
})
