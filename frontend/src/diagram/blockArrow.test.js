import { describe, it, expect } from 'vitest'
import {
  arrowOutline,
  arrowProportions,
  clampArrowShaft,
  clampArrowHead,
  DEFAULT_ARROW_SHAFT,
  DEFAULT_ARROW_HEAD,
} from './blockArrow.js'
import { presetPolygonPoints } from './polygon.js'

const box = { type: 'arrow', x: 0, y: 0, w: 200, h: 100 }

// #466: the head used to span 0.05 to 0.95 of the box height, so the shape left a
// 5% gap at the top and bottom of its own bounding box while its sides ran the full
// width. That is why the selection box hugged the arrow's sides but stood off its
// top and bottom.
describe('the block arrow fills its bounding box (#466)', () => {
  it('takes the head out to both edges', () => {
    const ys = arrowOutline(box).map(([, y]) => y)
    expect(Math.min(...ys)).toBe(0)
    expect(Math.max(...ys)).toBe(1)
  })

  it('still spans the full width, which was never the problem', () => {
    const xs = arrowOutline(box).map(([x]) => x)
    expect(Math.min(...xs)).toBe(0)
    expect(Math.max(...xs)).toBe(1)
  })

  // pentagon and hexagon in the same table both run 0 to 1 on both axes. The arrow
  // was the odd one out.
  it('leaves no gap for the selection box to stand off', () => {
    const points = presetPolygonPoints(box).split(' ').map((p) => p.split(',').map(Number))
    expect(Math.min(...points.map(([, y]) => y))).toBe(0)
    expect(Math.max(...points.map(([, y]) => y))).toBe(100)
  })
})

// #469: the two proportions a handle sets. Stored per shape, defaulted per type,
// exactly as cornerRadius is.
describe('the arrow proportions (#469)', () => {
  it('falls back to the stock look when the shape carries nothing', () => {
    expect(arrowProportions({ type: 'arrow' })).toEqual({
      shaft: DEFAULT_ARROW_SHAFT,
      head: DEFAULT_ARROW_HEAD,
    })
  })

  it('prefers the shape’s own values', () => {
    expect(arrowProportions({ arrowShaft: 0.2, arrowHead: 0.5 })).toEqual({ shaft: 0.2, head: 0.5 })
  })

  // A persisted document can hold anything, and an unusable number here would fold
  // the outline through itself rather than merely look wrong.
  it('ignores values that are not usable numbers', () => {
    expect(clampArrowShaft('0.2')).toBe(DEFAULT_ARROW_SHAFT)
    expect(clampArrowShaft(Number.NaN)).toBe(DEFAULT_ARROW_SHAFT)
    expect(clampArrowHead(undefined)).toBe(DEFAULT_ARROW_HEAD)
  })

  // The shaft runs from `shaft` to `1 - shaft`, so at 0.5 the two halves would meet
  // and the shaft would close up entirely.
  it('never lets the shaft reach the centre line', () => {
    expect(clampArrowShaft(0.9)).toBeLessThan(0.5)
    expect(clampArrowShaft(-1)).toBeGreaterThan(0)
  })

  it('keeps a head between the tail and the tip', () => {
    expect(clampArrowHead(2)).toBeLessThan(1)
    expect(clampArrowHead(-1)).toBeGreaterThan(0)
  })

  it('keeps the shaft symmetrical about the centre line', () => {
    const outline = arrowOutline({ arrowShaft: 0.2 })
    const ys = outline.map(([, y]) => y)
    expect(ys).toContain(0.2)
    expect(ys).toContain(0.8)
  })

  // An adjusted arrow has to reach the export the same way it reaches the canvas,
  // or a shared diagram shows a different arrow from the one on screen.
  it('feeds the adjusted outline through the shared preset path', () => {
    const adjusted = { ...box, arrowShaft: 0.1, arrowHead: 0.5 }
    expect(presetPolygonPoints(adjusted)).toBe('0,10 100,10 100,0 200,50 100,100 100,90 0,90')
    expect(presetPolygonPoints(adjusted)).not.toBe(presetPolygonPoints(box))
  })
})
