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

function coord(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}
