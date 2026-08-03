// Freely-drawn closed polygon (issue #139) — pure geometry, no Vue, so it stays
// unit-testable (CONVENTIONS). The draw gesture collects raw canvas-unit vertices;
// buildPolygonShape() converts them to the stored shape on commit.
//
// STORAGE CONVENTION: a polygon stores its vertices NORMALISED to its bounding box
// (each component 0..1), exactly like the fixed pentagon/hexagon presets in
// ShapeView. Because the render scales those normals back onto x/y/w/h, move
// (x/y), resize (w/h) and rotation all flow through the shared shape machinery with
// no special-casing — a polygon behaves like any other block shape.

// A closed polygon needs at least a triangle.
export const MIN_POLYGON_VERTICES = 3

// Consecutive vertices closer than this (canvas units) collapse to one, so a
// double-click's near-identical second press never leaves a zero-length edge.
const DEDUPE_EPSILON = 1

// Build the stored shape partial from raw canvas-unit vertices, or null when there
// are fewer than three distinct ones. Points are normalised to the extent; w/h are
// the extent itself (floored at 1 so an axis-aligned degenerate polygon never
// divides by zero). `epsilon` tunes the consecutive-duplicate merge for the caller's
// zoom.
export function buildPolygonShape(rawPoints, epsilon = DEDUPE_EPSILON) {
  const points = dedupeConsecutive(rawPoints || [], epsilon)
  if (points.length < MIN_POLYGON_VERTICES) return null
  const bbox = polygonBBox(points)
  const normals = points.map((p) => ({ x: (p.x - bbox.x) / bbox.w, y: (p.y - bbox.y) / bbox.h }))
  return { type: 'polygon', x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h, points: normals }
}

// Absolute SVG points string ("x,y x,y …") for a stored polygon — its normalised
// points scaled back onto the current x/y/w/h box. Shared by ShapeView, the
// export/thumbnail builder and the palette glyph so all three agree. Empty when the
// shape carries no points. Every component is coerced to a finite number: the
// export interpolates this straight into markup for a possibly-shared document, so
// a crafted point must never escape the attribute (it collapses to 0 instead).
export function polygonPointsString(shape) {
  const points = shape.points || []
  if (!points.length) return ''
  const x = num(shape.x)
  const y = num(shape.y)
  const w = num(shape.w)
  const h = num(shape.h)
  return points.map((p) => `${x + num(p.x) * w},${y + num(p.y) * h}`).join(' ')
}

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

// Whether `point` lies within `radius` (canvas units) of the first vertex — the
// snap-to-first close test.
export function isNearFirstVertex(point, first, radius) {
  if (!point || !first) return false
  return Math.hypot(point.x - first.x, point.y - first.y) <= radius
}

// Whether the in-progress vertices could form a closed polygon (>= 3 distinct).
export function canClosePolygon(rawPoints, epsilon = DEDUPE_EPSILON) {
  return dedupeConsecutive(rawPoints || [], epsilon).length >= MIN_POLYGON_VERTICES
}

// Axis-aligned extent of raw vertices as {x,y,w,h}. w/h are floored at 1 so a
// polygon collapsed onto one axis stays a valid (thin) box rather than a zero
// divisor. An empty list yields a zero box at the origin.
export function polygonBBox(points) {
  if (!points || !points.length) return { x: 0, y: 0, w: 0, h: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { x: minX, y: minY, w: Math.max(maxX - minX, 1), h: Math.max(maxY - minY, 1) }
}

// Drop any vertex within `epsilon` of the one before it, so accidental double taps
// (and a double-click's duplicate second press) never create degenerate edges.
function dedupeConsecutive(points, epsilon) {
  const out = []
  for (const p of points) {
    const prev = out[out.length - 1]
    if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) <= epsilon) continue
    out.push(p)
  }
  return out
}
