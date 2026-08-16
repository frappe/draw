import { describe, it, expect } from 'vitest'
import {
  hoverOutline,
  isTextElement,
  selectionOutline,
  NEUTRAL_HOVER,
  NEUTRAL_SELECT,
} from './selectionChrome.js'

// #414: a text element wore the same bright blue dashed box as a drawn shape, with
// eight handles around it, so typing one line on the canvas looked like editing a
// large text box. Text answers hover and selection in neutral grey now. Everything
// else keeps the blue — that chrome belongs to drawn objects.

const text = { type: 'text', w: 120, h: 24 }
const rectangle = { type: 'rectangle', w: 200, h: 120 }

describe('selectionOutline', () => {
  it('draws a text element in neutral grey, solid', () => {
    expect(selectionOutline(text)).toEqual({ color: NEUTRAL_SELECT, dashed: false, width: 1 })
  })

  // #451 item 8: one selection language for the canvas. A drawn shape keeps the
  // DASHES, which is what separates chrome from the shape's own border, but wears
  // the same grey as a node and a text element.
  it('draws every other shape in the same grey, dashed', () => {
    expect(selectionOutline(rectangle)).toEqual({ color: NEUTRAL_SELECT, dashed: true, width: 1.5 })
  })

  it('uses one colour for text and shapes alike', () => {
    expect(selectionOutline(rectangle).color).toBe(selectionOutline(text).color)
  })

  it('is thinner for text than for a shape', () => {
    expect(selectionOutline(text).width).toBeLessThan(selectionOutline(rectangle).width)
  })
})

describe('hoverOutline', () => {
  it('hugs text with a subtle grey line', () => {
    const style = hoverOutline(text)

    expect(style.color).toBe(NEUTRAL_HOVER)
    expect(style.margin, 'the halo must not stand off the words').toBeLessThan(
      hoverOutline(rectangle).margin,
    )
  })

  it('hovers every shape in the same neutral grey', () => {
    expect(hoverOutline(rectangle).color).toBe(NEUTRAL_HOVER)
  })
})

describe('isTextElement', () => {
  it('is true only for a text shape', () => {
    expect(isTextElement(text)).toBe(true)
    expect(isTextElement(rectangle)).toBe(false)
    expect(isTextElement(null)).toBe(false)
  })
})
