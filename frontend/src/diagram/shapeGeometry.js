import { curveRadius } from './mindmapNodeStyle.js'

// Corner radius for the box shapes, shared so the live draw preview, the
// committed shape and every export agree (#130).
//
// A plain rectangle is SHARP (#451 item 5). It used to be drawn at 8, which is
// visible rounding, and beside the dedicated rounded rectangle at 20 the two read
// as the same shape drawn twice. The pair has to be tellable apart at a glance,
// so the plain one now has square corners and the rounded one keeps its curve.
export const SHARP_CORNER_RADIUS = 0
export const ROUNDED_CORNER_RADIUS = 20

// The roundedness a shape can be set to from the toolbar (#411). The type default
// is one of them, so opening the picker never shifts a shape that was left alone.
export const CORNER_RADIUS_OPTIONS = [0, 4, 12, 20, 32]

// Box shapes: the ones whose geometry is a rectangle, and so the only ones a
// corner radius means anything for. An ellipse or a triangle has no corners to
// round.
const BOX_SHAPE_TYPES = ['rectangle', 'square', 'rounded']

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

// Whether a shape takes an adjustable corner radius — the toolbar stepper (#411)
// and the drag handle (#451 items 6/7) both gate on this.
//
// Every box shape qualifies now, not only the rounded rectangle: the handle is
// how a plain rectangle is rounded, and with sharp corners as the default there
// has to be a way back. A mind-map or flowchart node is excluded by its role: its
// corners come from its own control (branch curve / node glyph), so the two
// controls never fight over one shape.
export function supportsCornerRounding(shape) {
  return BOX_SHAPE_TYPES.includes(shape?.type) && !shape.role
}

// The largest radius that still reads as a rounded box rather than a stadium:
// half the shorter side, which is where opposite corner arcs meet. Dragging the
// handle past it would keep growing a number that changes nothing on screen.
export function maxCornerRadius(shape) {
  return Math.max(0, Math.min(shape?.w || 0, shape?.h || 0) / 2)
}

// A radius the shape can actually be drawn with, rounded to whole units so the
// stored value stays readable after a drag.
export function clampCornerRadius(shape, radius) {
  const wanted = Number.isFinite(radius) ? radius : 0
  return Math.round(Math.min(Math.max(wanted, 0), maxCornerRadius(shape)))
}
