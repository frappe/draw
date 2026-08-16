import { describe, it, expect } from 'vitest'
import {
  handleCenter,
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

  // #464: the outline is drawn ON the bounding box, so on a rectangle — and along a
  // hexagon's flat top and bottom — the dash and the shape's border are exactly
  // co-linear. A dash no wider than that border does not read as a dash: the border
  // fills the gaps between the segments and the edge comes out one solid line. So
  // the dash has to out-weigh whatever it is drawn over.
  it('draws the dash wider than the border it covers', () => {
    const bordered = { ...rectangle, border: { color: '#4F94FF', width: 1.5 } }
    expect(selectionOutline(bordered).width).toBeGreaterThan(1.5)
  })

  // The rule is relative, not a fixed bump: a fixed width would hide the dashes
  // again the moment a shape is given a heavier border.
  it('keeps out-weighing the border as the border grows', () => {
    for (const width of [1.5, 3, 4, 8]) {
      const shape = { ...rectangle, border: { color: '#4F94FF', width } }
      expect(selectionOutline(shape).width, `a ${width}px border swallows its dash`).toBeGreaterThan(width)
    }
  })

  // Nothing to clear, so it keeps the thinnest line rather than paying for a border
  // that is not there.
  it('stays thin on a shape with no border', () => {
    expect(selectionOutline(rectangle).width).toBe(1.5)
    expect(selectionOutline({ ...rectangle, border: { color: 'none', width: 0 } }).width).toBe(1.5)
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

// #517: the dashed outline was broken at every resize handle. Each opaque 12px
// square sat centred ON the box, masking its own width of the line in eight places
// — and at a corner it covered the corner point itself, so the two edges never met
// and the box read as four brackets instead of a closed rectangle.
describe('handleCenter', () => {
  const BOX = { x: 100, y: 50, w: 200, h: 120 }
  const SIZE = 12
  const FACTORS = {
    'top-left': [0, 0], top: [0.5, 0], 'top-right': [1, 0], right: [1, 0.5],
    'bottom-right': [1, 1], bottom: [0.5, 1], 'bottom-left': [0, 1], left: [0, 0.5],
  }
  // The handle's own square, from its centre.
  const rectOf = (name) => {
    const { x, y } = handleCenter(BOX, FACTORS[name], SIZE)
    return { left: x - SIZE / 2, right: x + SIZE / 2, top: y - SIZE / 2, bottom: y + SIZE / 2 }
  }

  it('puts every handle wholly outside the box it surrounds', () => {
    for (const name of Object.keys(FACTORS)) {
      const rect = rectOf(name)
      // At least one edge of the handle must clear the box entirely; a mid-edge
      // handle straddles the other axis, which is correct.
      const clears =
        rect.right <= BOX.x ||
        rect.left >= BOX.x + BOX.w ||
        rect.bottom <= BOX.y ||
        rect.top >= BOX.y + BOX.h
      expect(clears, `${name} still covers part of the outline`).toBe(true)
    }
  })

  it('leaves the handle touching the outline, not floating off it', () => {
    // Tangent: the corner handle's inner corner is exactly the box's corner.
    const topLeft = rectOf('top-left')
    expect(topLeft.right).toBe(BOX.x)
    expect(topLeft.bottom).toBe(BOX.y)
  })

  it('pushes each handle along its own normal, not diagonally for all', () => {
    // A mid-edge handle moves on ONE axis only, so it stays centred on its edge.
    const top = handleCenter(BOX, FACTORS.top, SIZE)
    expect(top.x).toBe(BOX.x + BOX.w / 2)
    expect(top.y).toBe(BOX.y - SIZE / 2)

    const right = handleCenter(BOX, FACTORS.right, SIZE)
    expect(right.x).toBe(BOX.x + BOX.w + SIZE / 2)
    expect(right.y).toBe(BOX.y + BOX.h / 2)
  })

  it('scales the push with the handle, so it holds at any zoom', () => {
    // handleSize is HANDLE / zoom, so a zoomed-out canvas hands in a bigger size.
    const zoomedOut = handleCenter(BOX, FACTORS['top-left'], 24)
    expect(zoomedOut.x).toBe(BOX.x - 12)
    expect(zoomedOut.y).toBe(BOX.y - 12)
  })
})
