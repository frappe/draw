// SVG path-string builders. Kept apart from the geometry helpers (which return
// numbers) and from sketch.js (which roughens geometry): this module only turns
// finished point paths into `d` attributes, and it is the single definition used
// by flowchart edge routes, whiteboard strokes, sketch outlines and thumbnails.

// A point path as an SVG path `d` string — `M` to the first point, `L` to each
// of the rest, optionally closed with `Z`. An empty path yields '' so callers can
// bind it straight to a :d without guarding.
export function pointsToPath(points, close = false) {
  if (!points.length) return ''
  const head = `M ${points[0].x} ${points[0].y}`
  const rest = points.slice(1).map((point) => `L ${point.x} ${point.y}`)
  return `${head} ${rest.join(' ')}${close ? ' Z' : ''}`
}
