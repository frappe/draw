// SVG path-string builders. Kept apart from the geometry helpers (which return
// numbers) and from sketch.js (which roughens geometry): this module only turns
// finished point paths into `d` attributes, and it is the single definition used
// by flowchart edge routes, whiteboard strokes, sketch outlines and thumbnails.

// A point path as an SVG path `d` string — `M` to the first point, `L` to each
// of the rest, optionally closed with `Z`. An empty path yields '' so callers can
// bind it straight to a :d without guarding.
//
// Coordinates are coerced to finite numbers. Whiteboard stroke points come straight
// out of the persisted document, and useThumbnail builds its SVG by string
// concatenation for markup that gets injected into a viewer's DOM — so a
// non-numeric coordinate could otherwise close the `d` attribute and add an event
// handler to the element. A non-number here is a bug in every caller anyway.
export function pointsToPath(points, close = false) {
  if (!points.length) return ''
  const head = `M ${coord(points[0].x)} ${coord(points[0].y)}`
  const rest = points.slice(1).map((point) => `L ${coord(point.x)} ${coord(point.y)}`)
  return `${head} ${rest.join(' ')}${close ? ' Z' : ''}`
}

// The same point path drawn as a SMOOTH curve: one quadratic per captured point,
// which takes the point itself as the control and the midpoint to its neighbour as
// the end. The curve therefore passes through every midpoint and bends around every
// captured point, so a freehand path reads as a drawn line instead of the chain of
// straight segments `pointsToPath` produces (#426).
//
// It changes only how the points are DRAWN — none of them move, none are dropped.
// That is what lets the live preview and the committed stroke render identically:
// the same points through the same builder, before and after the pointer lifts.
//
// Two points or fewer have no interior to curve through, so they fall back to the
// straight path. Coordinates are coerced by the same `coord` as above.
export function smoothPath(points) {
  if (!points || points.length < 3) return points ? pointsToPath(points) : ''
  const parts = [`M ${coord(points[0].x)} ${coord(points[0].y)}`]
  for (let i = 1; i < points.length - 1; i += 1) {
    const midX = (Number(points[i].x) + Number(points[i + 1].x)) / 2
    const midY = (Number(points[i].y) + Number(points[i + 1].y)) / 2
    parts.push(`Q ${coord(points[i].x)} ${coord(points[i].y)} ${coord(midX)} ${coord(midY)}`)
  }
  const last = points[points.length - 1]
  parts.push(`L ${coord(last.x)} ${coord(last.y)}`)
  return parts.join(' ')
}

function coord(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}
