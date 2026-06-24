// Stroke simplification — Ramer-Douglas-Peucker (spec diagram-types C10/G7).
// Freehand pen capture records a point on nearly every pointermove, which bloats
// the document JSON. On pointer-up the whiteboard agent runs simplifyStroke()
// to drop points that lie within `tolerance` canvas units of the line they sit
// on, keeping the visible shape while shrinking the path. Pure + unit-tested.

// Perpendicular distance from `point` to the segment a→b (canvas units).
function distanceToSegment(point, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  if (!lengthSquared) return Math.hypot(point.x - a.x, point.y - a.y)
  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}

// Recursive RDP: keep the endpoints, recurse on the side whose farthest point
// exceeds the tolerance, and drop everything in between otherwise.
function simplifySegment(points, first, last, tolerance, keep) {
  let maxDistance = 0
  let index = -1
  for (let i = first + 1; i < last; i += 1) {
    const distance = distanceToSegment(points[i], points[first], points[last])
    if (distance > maxDistance) {
      maxDistance = distance
      index = i
    }
  }
  if (maxDistance <= tolerance || index === -1) return
  simplifySegment(points, first, index, tolerance, keep)
  keep.add(index)
  simplifySegment(points, index, last, tolerance, keep)
}

// Simplify a freehand point path. `tolerance` is in canvas units so the result
// is independent of zoom (Part G4). Paths of two-or-fewer points pass through.
export function simplifyStroke(points, tolerance = 1.5) {
  if (!points || points.length <= 2) return points ? [...points] : []
  const keep = new Set([0, points.length - 1])
  simplifySegment(points, 0, points.length - 1, tolerance, keep)
  return [...keep].sort((a, b) => a - b).map((index) => points[index])
}
