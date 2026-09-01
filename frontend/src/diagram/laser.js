// Laser-pointer trail geometry (spec C5: self-fading trail, no persistent marks).
// Pure and browser-free: the composable owns the timestamps and the animation
// loop, the render layer only binds what these helpers return. Nothing here ever
// reaches the document — the trail is chrome and is never saved or exported.
//
// The trail is ONE tapered outline, not a run of stroked segments (#450). Drawing
// a segment per point gave every segment its own opacity and width, so their
// round caps overlapped at differing opacities and the trail read as a string of
// beads. A single filled ribbon has no seams to show.

// How long a trail point lives. Long enough to read as a comet tail while the
// pointer moves, short enough that it is gone right after it stops.
export const LASER_FADE_MS = 800

export const LASER_COLOR = '#E03636'
// Canvas units, like stroke widths (spec C10): the trail scales with zoom.
export const LASER_WIDTH = 5
export const LASER_HEAD_RADIUS = 5
// Width of the halo behind the core ribbon, as a multiple of the trail width.
// The glow is a wide translucent stroke on the same outline, so it costs one more
// path rather than an SVG filter re-run on every animation frame.
export const LASER_GLOW_SCALE = 3
// Weight given to each incoming pointer sample. Keeping some of the last spine
// position filters hand tremor before the trail geometry is built.
export const LASER_POINT_EASING = 0.4

// Longest gap (canvas units) left between two spine points before the outline is
// built. A fast flick reports pointer moves tens of units apart; without filling
// those in, the taper steps from one width to the next and the ribbon facets.
const RESAMPLE_SPACING = 5
// Most points the spine may hold. The outline is rebuilt on every animation
// frame, so the work has to be bounded by something other than how fast the hand
// moved: a flick across a zoomed-out canvas covers thousands of canvas units, and
// at a fixed spacing that is thousands of points per frame.
const MAX_SPINE_POINTS = 400
// Half-width kept at the oldest end, as a fraction of the head's. Not zero: a
// true point tapers to a hairline that anti-aliases into dashes — the artifact
// being fixed.
const TAIL_WIDTH_RATIO = 0.15
// Moving-average passes over the spine. See smoothTrail.
const SMOOTHING_PASSES = 2

// Drop points older than the fade window. Callers pass `now` so one timestamp
// drives a whole frame.
export function pruneTrail(points, now) {
  return points.filter((point) => now - point.at < LASER_FADE_MS)
}

// Ease an incoming sample toward the last accepted spine point. Outline smoothing
// rounds the ribbon around its spine; this is deliberately earlier in the pipeline
// so raw pointer jitter cannot become part of that spine in the first place.
export function smoothLaserPoint(previous, point) {
  if (!previous) return point
  return {
    ...point,
    x: previous.x + (point.x - previous.x) * LASER_POINT_EASING,
    y: previous.y + (point.y - previous.y) * LASER_POINT_EASING,
  }
}

// The trail as one closed outline: down the left of the path and back up the
// right, each side offset by a half-width that grows from the tail to the head.
// Callers fill it as a single path. Fewer than two live points have no direction
// to offset along, so they yield no outline and only the head dot renders.
//
// Expired points are dropped here rather than assumed away, for the same reason
// they always were: a stale point would otherwise anchor the tail where the
// pointer was a second ago.
export function trailOutline(points, now) {
  const spine = smoothTrail(resampleTrail(pruneTrail(points, now)))
  if (spine.length < 2) return []
  const left = []
  const right = []
  spine.forEach((point, index) => {
    const normal = normalAt(spine, index)
    const half = halfWidthAt(index, spine.length)
    left.push({ x: point.x + normal.x * half, y: point.y + normal.y * half })
    right.push({ x: point.x - normal.x * half, y: point.y - normal.y * half })
  })
  return [...left, ...right.reverse()]
}

// How opaque the whole trail is, from the age of its newest point: a resting
// pointer dims out instead of blinking off. The ribbon fades as one piece —
// the taper, not a per-point opacity, is what makes the tail recede.
export function trailOpacity(points, now) {
  if (!points.length) return 0
  const newest = points[points.length - 1]
  return clamp(1 - (now - newest.at) / LASER_FADE_MS, 0, 1)
}

// Half the ribbon width at a point, tapering from the tail (index 0) to the head.
function halfWidthAt(index, count) {
  const alongTrail = count > 1 ? index / (count - 1) : 1
  return (LASER_WIDTH / 2) * (TAIL_WIDTH_RATIO + (1 - TAIL_WIDTH_RATIO) * alongTrail)
}

// Unit normal to the path at `index`, taken across the neighbouring points so the
// offset follows the curve rather than one incoming segment. A zero-length span
// (two identical points) has no direction and offsets by nothing.
function normalAt(points, index) {
  const before = points[Math.max(index - 1, 0)]
  const after = points[Math.min(index + 1, points.length - 1)]
  const dx = after.x - before.x
  const dy = after.y - before.y
  const length = Math.hypot(dx, dy)
  if (!length) return { x: 0, y: 0 }
  return { x: -dy / length, y: dx / length }
}

// Fill long gaps with interpolated points. Interpolation only: every added point
// sits on the line the pointer already travelled, so the trajectory the user drew
// is preserved exactly — nothing is smoothed away or re-aimed.
function resampleTrail(points) {
  if (points.length < 2) return points
  const spacing = resampleSpacing(points)
  const dense = [points[0]]
  for (let i = 1; i < points.length; i += 1) {
    const steps = Math.max(Math.ceil(distance(points[i - 1], points[i]) / spacing), 1)
    for (let step = 1; step <= steps; step += 1) {
      dense.push(interpolate(points[i - 1], points[i], step / steps))
    }
  }
  return dense
}

// Points sit RESAMPLE_SPACING apart until that would cost more than the budget,
// then they spread evenly instead. A long trail loses a little of its curve
// resolution, which is invisible, rather than the frame rate, which is not.
function resampleSpacing(points) {
  let length = 0
  for (let i = 1; i < points.length; i += 1) length += distance(points[i - 1], points[i])
  return Math.max(RESAMPLE_SPACING, length / MAX_SPINE_POINTS)
}

function distance(from, to) {
  return Math.hypot(to.x - from.x, to.y - from.y)
}

// Two passes of a three-point moving average — enough to settle the tremor in a
// hand-held pointer. It deliberately does NOT round a real direction change: the
// window spans about two resample steps, so a genuine turn survives and only
// sample-to-sample noise averages out.
function smoothTrail(points) {
  let smoothed = points
  for (let pass = 0; pass < SMOOTHING_PASSES; pass += 1) smoothed = averageNeighbours(smoothed)
  return smoothed
}

// One pass: each interior point moves to the mean of itself and its neighbours,
// ends pinned so the trail neither shortens nor drifts off the pointer.
function averageNeighbours(points) {
  if (points.length < 3) return points
  const smoothed = [points[0]]
  for (let i = 1; i < points.length - 1; i += 1) {
    smoothed.push({
      x: (points[i - 1].x + points[i].x + points[i + 1].x) / 3,
      y: (points[i - 1].y + points[i].y + points[i + 1].y) / 3,
    })
  }
  smoothed.push(points[points.length - 1])
  return smoothed
}

function interpolate(from, to, ratio) {
  return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio }
}

function clamp(value, low, high) {
  return Math.min(Math.max(value, low), high)
}
