import { describe, it, expect } from 'vitest'
import {
  shapeCornerRadius,
  SHARP_CORNER_RADIUS,
  maxCornerRadius,
  clampCornerRadius,
  ROUNDED_CORNER_RADIUS,
  cornerRadiusOf,
} from './shapeGeometry.js'
import { curveRadius } from './mindmapNodeStyle.js'

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

// The roundedness picker (StyleGroup) writes its choice onto the shape itself, and
// everything that draws a box — canvas, hover outline, export — resolves it here (#411).
describe('a per-shape corner radius', () => {
  it('wins over the type default', () => {
    expect(shapeCornerRadius('rounded', 4)).toBe(4)
    expect(shapeCornerRadius('rectangle', 32)).toBe(32)
    expect(shapeCornerRadius('rounded', 0)).toBe(0)
  })

  it('falls back to the type default when the shape carries none', () => {
    expect(shapeCornerRadius('rounded', undefined)).toBe(ROUNDED_CORNER_RADIUS)
    expect(shapeCornerRadius('rectangle', null)).toBe(SHARP_CORNER_RADIUS)
  })

  // A persisted document can hold anything; an unusable radius must not reach an
  // `rx` attribute, where it would flatten the corner instead of rounding it.
  it('ignores a radius that is not a usable number', () => {
    expect(shapeCornerRadius('rounded', '32')).toBe(ROUNDED_CORNER_RADIUS)
    expect(shapeCornerRadius('rounded', Number.NaN)).toBe(ROUNDED_CORNER_RADIUS)
    expect(shapeCornerRadius('rounded', -8)).toBe(ROUNDED_CORNER_RADIUS)
  })

  // The stepped presets this used to check are gone with the toolbar control that
  // offered them (#465). Roundedness is dragged, so the range that matters is the
  // continuous one clampCornerRadius enforces, which is covered below.
})

// #427 item 3: one helper decides the radius a shape is DRAWN with, so a hover or
// selection outline can never trace corners the shape itself does not have.
describe('cornerRadiusOf', () => {
  it('reads a mind-map node from its own curve setting', () => {
    const node = { type: 'rounded', role: 'mindmap-node', h: 100, mindmap: { curve: 'moderate' } }
    expect(cornerRadiusOf(node)).toBe(curveRadius('moderate'))
    expect(cornerRadiusOf({ ...node, mindmap: { curve: 'high' } })).toBe(curveRadius('high'))
  })

  it('caps a node radius at half its height, so a short node is not an oval', () => {
    const short = { type: 'rounded', role: 'mindmap-node', h: 20, mindmap: { curve: 'high' } }
    expect(cornerRadiusOf(short)).toBe(10)
  })

  it('reads every other shape from its type or explicit override', () => {
    expect(cornerRadiusOf({ type: 'rounded' })).toBe(ROUNDED_CORNER_RADIUS)
    expect(cornerRadiusOf({ type: 'rect' })).toBe(SHARP_CORNER_RADIUS)
    expect(cornerRadiusOf({ type: 'rounded', cornerRadius: 4 })).toBe(4)
  })
})

// #451 items 5/6/7. The drag handle writes through these, so they are what stops a
// radius the box cannot draw from reaching the document.
describe('the limits a dragged radius is held to', () => {
  const box = { type: 'rectangle', w: 200, h: 120 }

  it('stops at half the shorter side, where the corner arcs meet', () => {
    expect(maxCornerRadius(box)).toBe(60)
    expect(maxCornerRadius({ w: 40, h: 400 })).toBe(20)
  })

  it('clamps a radius into that range and rounds it to whole units', () => {
    expect(clampCornerRadius(box, 24.4)).toBe(24)
    expect(clampCornerRadius(box, 500)).toBe(60)
    expect(clampCornerRadius(box, -10)).toBe(0)
  })

  it('treats a missing or unusable radius as square', () => {
    expect(clampCornerRadius(box, undefined)).toBe(0)
    expect(clampCornerRadius(box, NaN)).toBe(0)
    expect(maxCornerRadius(undefined)).toBe(0)
  })

  // A plain rectangle draws sharp now, which is the whole point of item 5: the two
  // rectangle tiles have to be tellable apart.
  it('keeps the two rectangle tiles visibly different', () => {
    expect(SHARP_CORNER_RADIUS).toBe(0)
    expect(ROUNDED_CORNER_RADIUS).toBeGreaterThan(12)
  })
})
