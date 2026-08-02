import { describe, it, expect } from 'vitest'
import { nodeRx } from './mindmapNodeShape.js'

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
