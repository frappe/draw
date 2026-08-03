import { describe, it, expect } from 'vitest'
import { nodeRx, nodeClickZone, NODE_BORDER_ZONE } from './mindmapNodeShape.js'

// A mind-map node box only needs w/h here; nodeRx reads h.
const box = (h) => ({ w: 160, h })

describe('nodeRx (mind-map node corner radius)', () => {
  it('caps the default pill so a tall/expanded node is a rounded rect, not an oval', () => {
    // Real nodes grow to ~84px tall over three text lines. The old h/2 gave a
    // 42px radius (a full stadium); it must stay a subtle rounded rectangle.
    expect(nodeRx({}, box(84))).toBe(12)
  })

  it('caps a single-line node too (h/2 would be 20)', () => {
    expect(nodeRx({}, box(40))).toBe(12)
  })

  it('keeps h/2 while it is below the cap, so short nodes stay softly rounded', () => {
    expect(nodeRx({}, box(16))).toBe(8) // min(8, 12)
  })

  it('caps exactly at the boundary height', () => {
    expect(nodeRx({}, box(24))).toBe(12) // min(12, 12)
  })

  it('treats an undefined shape as the default pill', () => {
    expect(nodeRx({ shape: undefined }, box(80))).toBe(12)
  })

  it('leaves the explicit rounded/rectangle shapes unchanged (height-independent)', () => {
    expect(nodeRx({ shape: 'rounded' }, box(84))).toBe(12)
    expect(nodeRx({ shape: 'rectangle' }, box(84))).toBe(4)
  })
})

// #123: a single click over the label area edits the text (drops the caret in),
// a click on the border rim selects — and the cursor tells them apart. nodeRx's
// box helper fixes the height; give the zone tests full w+h boxes.
const zoneBox = (w, h) => ({ w, h })

describe('nodeClickZone (mind-map node click/hover zones, #123)', () => {
  const b = zoneBox(160, 44) // a roomy single-line node; edge default is 8

  it('a point over the label interior EDITS (single click drops the caret in)', () => {
    expect(nodeClickZone(80, 22, b)).toBe('edit') // dead centre
    expect(nodeClickZone(NODE_BORDER_ZONE + 1, 22, b)).toBe('edit') // just inside the left rim
  })

  it('a point on any border rim SELECTS, not edits', () => {
    expect(nodeClickZone(2, 22, b)).toBe('select') // near left edge
    expect(nodeClickZone(158, 22, b)).toBe('select') // near right edge
    expect(nodeClickZone(80, 2, b)).toBe('select') // near top edge
    expect(nodeClickZone(80, 42, b)).toBe('select') // near bottom edge
  })

  it('treats the threshold boundary as the innermost edit pixel (inclusive)', () => {
    // The rim is [0, edge); the interior starts exactly at edge, matching the
    // inset the cursor rect uses — so cursor and click can never disagree.
    expect(nodeClickZone(NODE_BORDER_ZONE, 22, b)).toBe('edit')
    expect(nodeClickZone(NODE_BORDER_ZONE - 0.01, 22, b)).toBe('select')
    expect(nodeClickZone(160 - NODE_BORDER_ZONE, 22, b)).toBe('edit')
  })

  it('counts a point outside the box as select (never a stray edit)', () => {
    expect(nodeClickZone(-5, 22, b)).toBe('select')
    expect(nodeClickZone(200, 22, b)).toBe('select')
    expect(nodeClickZone(80, 60, b)).toBe('select')
  })

  it('a node too small to hold an interior is all rim, so it never traps the caret', () => {
    // h = 16 = 2*edge, so top and bottom rims meet: no interior at all.
    expect(nodeClickZone(30, 8, zoneBox(60, 16))).toBe('select')
    // Both dimensions tiny: even the centre selects.
    expect(nodeClickZone(6, 6, zoneBox(12, 12))).toBe('select')
  })

  it('honours a custom edge threshold', () => {
    // With a fat 20px rim, a point 12px in is now rim, not interior.
    expect(nodeClickZone(12, 22, b, 20)).toBe('select')
    expect(nodeClickZone(12, 22, b, 8)).toBe('edit')
  })
})
