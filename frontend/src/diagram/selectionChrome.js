// How the canvas draws "you are hovering this" and "you have this selected"
// (#414, #451 item 8).
//
// One selection language for the whole canvas: the neutral grey a flowchart node
// wears. Shapes used to be wrapped in a bright blue dashed rectangle, which is
// louder than anything it surrounds, does not belong to the Frappe palette, and
// meant a diagram with a shape and a node selected showed two different ideas of
// "selected". Grey states it once.
//
// The outline is still DASHED on a drawn shape and solid on text: a shape has a
// border of its own, and a solid grey line around a grey-bordered rectangle is
// unreadable as chrome. That distinction is what the dashes carry, not the colour.

// Canvas colours are literal, never chrome tokens (CONVENTIONS rule 2).
// The resting node border, and the ink a selected node draws itself with.
export const NEUTRAL_HOVER = '#C7C7C7'
export const NEUTRAL_SELECT = '#525252'

export function isTextElement(shape) {
  return shape?.type === 'text'
}

// The selection outline for one shape. `dashed` separates "this is a selection"
// from "this is the object's own border" on a drawn shape; a text element has no
// border of its own, so a thin solid line is unambiguous without shouting.
export function selectionOutline(shape) {
  return isTextElement(shape)
    ? { color: NEUTRAL_SELECT, dashed: false, width: 1 }
    : { color: NEUTRAL_SELECT, dashed: true, width: 1.5 }
}

// The hover halo. `margin` is the on-screen gap between the shape and the halo:
// text sits tight, so the outline hugs the words instead of standing off them.
export function hoverOutline(shape) {
  return isTextElement(shape)
    ? { color: NEUTRAL_HOVER, opacity: 1, margin: 2, width: 1 }
    : { color: NEUTRAL_HOVER, opacity: 1, margin: 3, width: 1.5 }
}
