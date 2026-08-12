import { curveRadius } from './mindmapNodeStyle.js'

// Corner radius for the box shapes, shared so the live draw preview, the
// committed shape and every export agree (#130). A plain rectangle / square is
// only lightly rounded (8); the dedicated "rounded rectangle" is pill-round (20).
// The preview ghost renders through the same value, so a sharp rectangle never
// previews as a rounded one. Non-box shapes (ellipse, diamond, …) ignore this.
export const SHARP_CORNER_RADIUS = 8
export const ROUNDED_CORNER_RADIUS = 20

// The roundedness a shape can be set to from the toolbar (#411). The type default
// is one of them, so opening the picker never shifts a shape that was left alone.
export const CORNER_RADIUS_OPTIONS = [4, 12, 20, 32]

// `radius` is the shape's own `cornerRadius` when it carries one: an explicit
// choice wins over the type default. It arrives from a persisted document, so only
// a usable number counts — a string or a NaN would otherwise reach an `rx`
// attribute and drop the corner entirely.
export function shapeCornerRadius(type, radius) {
  if (Number.isFinite(radius) && radius >= 0) return radius
  return type === 'rounded' ? ROUNDED_CORNER_RADIUS : SHARP_CORNER_RADIUS
}

// The radius a SHAPE is actually drawn with. A mind-map node's corners come from
// its own curve setting, every other shape's from its type (or an explicit
// override). Everything that traces a shape's outline reads this one function, so
// a highlight can never draw corners the shape itself does not have (#427 item 3).
export function cornerRadiusOf(shape) {
  if (shape?.role === 'mindmap-node' && shape.mindmap?.curve) {
    return curveRadius(shape.mindmap.curve, shape.h)
  }
  return shapeCornerRadius(shape?.type, shape?.cornerRadius)
}

// A plain rounded rectangle — the one shape whose roundedness is adjustable (#411).
// A mind-map or flowchart node can also carry type 'rounded', but its corners come
// from its own role-specific control (branch curve / node glyph), so a role
// disqualifies it and the two controls never fight over the same shape.
export function isRoundedBoxShape(shape) {
  return shape?.type === 'rounded' && !shape.role
}
