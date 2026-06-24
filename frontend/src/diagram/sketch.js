// Hand-drawn "sketch" pass (spec diagram-types C4). A board-wide or per-object
// toggle renders shapes/connectors/borders with a roughened, hand-drawn feel.
// This is a tiny hand-rolled roughener (no external dependency) that turns a
// straight segment into a slightly wavering poly-line and a rectangle into a
// jittered outline. It is pure geometry in canvas units so it feeds the one
// shared render path (Part G8); the renderer applies it only when sketch is on.

// Deterministic pseudo-random in [-1, 1] from an integer seed, so a sketch
// re-renders identically every frame instead of jittering on each paint.
function seeded(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  return (value - Math.floor(value)) * 2 - 1
}

// Roughen a straight segment into a path of small waypoints whose offsets are
// perpendicular to the line, scaled by `amount` (canvas units). Returns an
// array of points (including both endpoints) the caller draws as a polyline.
export function roughenSegment(a, b, amount = 1.6, seed = 1) {
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  const steps = Math.max(2, Math.min(8, Math.round(length / 40)))
  const nx = length ? -(b.y - a.y) / length : 0
  const ny = length ? (b.x - a.x) / length : 0
  const points = []
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const interior = i > 0 && i < steps
    const wobble = interior ? seeded(seed + i) * amount : 0
    points.push({
      x: a.x + (b.x - a.x) * t + nx * wobble,
      y: a.y + (b.y - a.y) * t + ny * wobble,
    })
  }
  return points
}

// Roughen the four edges of an axis-aligned rect into one closed point path.
export function roughenRect(rect, amount = 1.6, seed = 1) {
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h },
  ]
  const path = []
  for (let i = 0; i < corners.length; i += 1) {
    const segment = roughenSegment(corners[i], corners[(i + 1) % 4], amount, seed + i * 7)
    path.push(...(i === 0 ? segment : segment.slice(1)))
  }
  return path
}

// Convert a point path to an SVG path `d` string (M then L's). Closed by caller
// appending 'Z' via the `close` flag.
export function pointsToPath(points, close = false) {
  if (!points.length) return ''
  const head = `M ${points[0].x} ${points[0].y}`
  const rest = points.slice(1).map((point) => `L ${point.x} ${point.y}`)
  return `${head} ${rest.join(' ')}${close ? ' Z' : ''}`
}
