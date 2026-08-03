import { describe, it, expect } from 'vitest'
import { shapeCornerRadius, SHARP_CORNER_RADIUS, ROUNDED_CORNER_RADIUS } from './shapeGeometry.js'

// ShapeView renders both the committed shape and the draw preview through this
// value, so a plain rectangle preview can't look like a rounded rectangle (#130).
describe('shapeCornerRadius', () => {
  it('keeps a plain rectangle sharp (not the rounded rect radius)', () => {
    expect(shapeCornerRadius('rectangle')).toBe(SHARP_CORNER_RADIUS)
    expect(shapeCornerRadius('rectangle')).not.toBe(ROUNDED_CORNER_RADIUS)
  })

  it('rounds only the dedicated rounded rectangle', () => {
    expect(shapeCornerRadius('rounded')).toBe(ROUNDED_CORNER_RADIUS)
  })

  it('treats a square like a plain rectangle', () => {
    expect(shapeCornerRadius('square')).toBe(SHARP_CORNER_RADIUS)
  })
})
