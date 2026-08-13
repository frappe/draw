// How the canvas draws "you are hovering this" and "you have this selected" (#414).
//
// A text element is not a box someone drew — it is the words themselves. Wrapped in
// the standard blue dashed rectangle it read as a large text box being edited when
// all the user had done was type a line on the canvas. Text gets the quiet grey
// treatment the mind-map node got in #427 instead: the outline traces what is
// actually there, in the neutral greys of the Espresso ramp, and nothing at all
// while the caret is in it.
//
// Every other shape keeps the blue: it is drawn chrome around drawn objects, and
// changing it would be a different (and much larger) decision.

// Canvas colours are literal, never chrome tokens (CONVENTIONS rule 2).
export const SELECT_BLUE = '#006EDB'
// The resting node border, and the ink a selected node draws itself with.
export const NEUTRAL_HOVER = '#C7C7C7'
export const NEUTRAL_SELECT = '#525252'

export function isTextElement(shape) {
  return shape?.type === 'text'
}

// The selection outline for one shape. `dashed` is what separates "this is a
// selection" from "this is the object's own border" on a drawn shape; a text
// element has no border of its own, so a thin solid grey line is unambiguous
// without shouting.
export function selectionOutline(shape) {
  return isTextElement(shape)
    ? { color: NEUTRAL_SELECT, dashed: false, width: 1 }
    : { color: SELECT_BLUE, dashed: true, width: 1.5 }
}

// The hover halo. `margin` is the on-screen gap between the shape and the halo:
// text sits tight, so the outline hugs the words instead of standing off them.
export function hoverOutline(shape) {
  return isTextElement(shape)
    ? { color: NEUTRAL_HOVER, opacity: 1, margin: 2, width: 1 }
    : { color: SELECT_BLUE, opacity: 0.45, margin: 3, width: 1.5 }
}
