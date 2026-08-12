import { describe, it, expect } from 'vitest'
import {
  shapeCornerRadius,
  SHARP_CORNER_RADIUS,
  ROUNDED_CORNER_RADIUS,
  CORNER_RADIUS_OPTIONS,
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

  it('offers four presets, the current default among them', () => {
    expect(CORNER_RADIUS_OPTIONS).toHaveLength(4)
    expect(CORNER_RADIUS_OPTIONS).toContain(ROUNDED_CORNER_RADIUS)
  })
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
