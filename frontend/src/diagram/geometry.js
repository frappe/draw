// Pure geometry helpers for shapes — bounding boxes, anchor points, rotation
// math, and hit testing. No Vue here so this stays unit-testable (CONVENTIONS).
// All values are in logical canvas units.

const HALF = 0.5

// Centre point of a shape's unrotated box.
export function shapeCenter(shape) {
  return { x: shape.x + shape.w * HALF, y: shape.y + shape.h * HALF }
}

// Unrotated bounding box of a shape.
export function boundingBox(shape) {
  return { x: shape.x, y: shape.y, w: shape.w, h: shape.h }
}

// Rotate a point around an origin by degrees.
export function rotatePoint(point, origin, degrees) {
  const radians = (degrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const dx = point.x - origin.x
  const dy = point.y - origin.y
  return { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos }
}

// The eight named anchor positions on the unrotated box.
const ANCHOR_FACTORS = {
  'top-left': [0, 0],
  top: [HALF, 0],
  'top-right': [1, 0],
  right: [1, HALF],
  'bottom-right': [1, 1],
  bottom: [HALF, 1],
  'bottom-left': [0, 1],
  left: [0, HALF],
}

export const ANCHOR_NAMES = Object.keys(ANCHOR_FACTORS)

// World position of a named anchor, honouring the shape's rotation.
export function anchorPoint(shape, anchorName) {
  const [fx, fy] = ANCHOR_FACTORS[anchorName] || ANCHOR_FACTORS.top
  const local = { x: shape.x + shape.w * fx, y: shape.y + shape.h * fy }
  if (!shape.rotation) return local
  return rotatePoint(local, shapeCenter(shape), shape.rotation)
}

// The four corners of the (possibly rotated) shape, in world space.
export function shapeCorners(shape) {
  const corners = ['top-left', 'top-right', 'bottom-right', 'bottom-left']
  return corners.map((name) => anchorPoint(shape, name))
}

// Axis-aligned bounding box that encloses a rotated shape (spec §5.4, §7.6).
export function axisAlignedBBox(shape) {
  const corners = shapeCorners(shape)
  const xs = corners.map((point) => point.x)
  const ys = corners.map((point) => point.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY }
}

// Point-in-axis-aligned-rect test.
export function pointInRect(point, rect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.w &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.h
  )
}

// Point-in-shape test that accounts for rotation by un-rotating the point.
export function pointInShape(point, shape) {
  const local = shape.rotation
    ? rotatePoint(point, shapeCenter(shape), -shape.rotation)
    : point
  return pointInRect(local, boundingBox(shape))
}

// Do two axis-aligned boxes overlap (used by marquee selection)?
export function rectsIntersect(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}
