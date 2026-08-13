// Eraser model surgery (issue #39). Pure domain code — no Vue: it takes the plain
// document state, mutates the object lists, and reports what it removed. The
// gesture (snapshot on press, one history commit on release) lives in
// composables/useWhiteboardInteraction.js.
//
// Two eraser modes (spec C3 "eraser removes whole strokes" is now the object one):
// - 'ink'    rubs out only the ink under the tip, splitting a freehand stroke into
//            the sub-paths that survive around the erased span.
// - 'object' deletes the whole element the tip touches — stroke, line, table,
//            sticky note, base shape or connector (Excalidraw-style).

import { anchorPoint, distanceToSegment, pointInRect, pointInShape } from '@/diagram/geometry.js'
import { distanceToStroke, makeStroke, tableHeight, tableWidth } from '@/diagram/whiteboardModel.js'
import { strokeOpacity } from '@/diagram/whiteboardColors.js'

// Tip radii in canvas units, in the order the size picker shows them.
export const ERASER_SIZES = [6, 14, 30]

// Cap on the samples one pointer move is expanded into, so a huge jump (a drag
// that leaves the window and comes back) can't stall the frame.
const MAX_SWEEP_STEPS = 64

// Pointer events arrive sampled: a fast drag jumps tens of canvas units between
// two moves, and erasing a single disk per sample left untouched slivers of ink
// in the gaps (#39). Walk the gap in half-tip steps so one pass erases a
// continuous swept band. Excludes `from` (already erased on the previous event).
export function sweepPoints(from, to, radius) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y)
  const steps = Math.min(MAX_SWEEP_STEPS, Math.max(1, Math.ceil(distance / (radius / 2))))
  const points = []
  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps
    points.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t })
  }
  return points
}

// Ink eraser: rub the part of every freehand stroke under the tip out. A stroke
// entirely under the tip disappears. Straight lines are ink too but have no
// partial form, so a touched line goes whole — the old eraser slid over lines and
// left them behind (#39). Returns true when the model changed.
export function eraseInkAt(model, point, radius) {
  const strokes = eraseStrokes(model.strokes || [], point, radius)
  const lines = model.lines || []
  const keptLines = lines.filter((line) => !touchesLine(line, point, radius))
  if (strokes) model.strokes = strokes
  if (keptLines.length !== lines.length) model.lines = keptLines
  return Boolean(strokes) || keptLines.length !== lines.length
}

// Object eraser: every whole element the tip touches goes. Returns the removed
// objects as [{ kind, id }] — whiteboard kinds plus 'shape' / 'connector' — for
// the caller's single history commit.
export function eraseObjectsAt(state, point, radius) {
  const model = state.whiteboard || {}
  const removed = []
  // Connectors first: their endpoints resolve against the shapes list, which the
  // next call rewrites.
  dropTouched(state, 'connectors', 'connector', removed, (connector) =>
    touchesConnector(connector, point, radius, state.shapes),
  )
  dropTouched(state, 'shapes', 'shape', removed, (shape) => isErasable(shape) && pointInShape(point, shape))
  dropTouched(model, 'strokes', 'stroke', removed, (stroke) => touchesStroke(stroke, point, radius))
  dropTouched(model, 'lines', 'line', removed, (line) => touchesLine(line, point, radius))
  dropTouched(model, 'tables', 'table', removed, (table) => pointInRect(point, tableBox(table)))
  dropTouched(model, 'stickyNotes', 'sticky', removed, (note) => pointInRect(point, note))
  return removed
}

// Drop every element the tip touches from one list on `owner`, recording
// { kind, id } for the caller. The list is only re-assigned when something was
// actually removed, so a miss neither churns reactivity nor adds an empty array
// to a document that never had that list.
function dropTouched(owner, key, kind, removed, hits) {
  const list = owner[key] || []
  const kept = []
  for (const item of list) {
    if (hits(item)) removed.push({ kind, id: item.id })
    else kept.push(item)
  }
  if (kept.length !== list.length) owner[key] = kept
}

// Hidden and locked shapes aren't grabbable, so the eraser doesn't take them
// either (matching the select-tool hit test).
function isErasable(shape) {
  return !shape.hidden && !shape.locked
}

function touchesStroke(stroke, point, radius) {
  return distanceToStroke(point, stroke) <= radius + (stroke.width || 1) / 2
}

function touchesLine(line, point, radius) {
  const a = { x: line.x1, y: line.y1 }
  const b = { x: line.x2, y: line.y2 }
  return distanceToSegment(point, a, b) <= radius + (line.width || 1) / 2
}

function touchesConnector(connector, point, radius, shapes) {
  const a = endpointPoint(connector.from, shapes)
  const b = endpointPoint(connector.to, shapes)
  return distanceToSegment(point, a, b) <= radius
}

// An attached endpoint sits on its shape's anchor; a free one carries its own x/y.
function endpointPoint(endpoint, shapes) {
  if (endpoint?.shapeId) {
    const shape = (shapes || []).find((candidate) => candidate.id === endpoint.shapeId)
    if (shape) return anchorPoint(shape, endpoint.anchor || 'right')
  }
  return { x: endpoint?.x || 0, y: endpoint?.y || 0 }
}

function tableBox(table) {
  return { x: table.x, y: table.y, w: tableWidth(table), h: tableHeight(table) }
}

// Rebuild the stroke list with the ink under the tip rubbed out. Returns null
// when no stroke was touched, so the caller keeps the existing array.
function eraseStrokes(strokes, point, radius) {
  let changed = false
  const next = []
  for (const stroke of strokes) {
    const reach = radius + (stroke.width || 1) / 2
    if (distanceToStroke(point, stroke) > reach) {
      next.push(stroke)
      continue
    }
    const { runs, touched } = splitStrokeByErase(stroke.points, point, reach)
    // Nothing of this stroke fell under the tip — keep the original object (and
    // its id). This has to come from the split itself: comparing point COUNTS
    // instead misses a clipped end segment, where the erased endpoint is replaced
    // by a boundary point and the count comes back unchanged, so the tip of the
    // stroke would silently survive.
    if (!touched) {
      next.push(stroke)
      continue
    }
    changed = true
    for (const run of runs) {
      // The surviving pieces are new stroke objects, so every visual property of
      // the original has to be copied onto them — a missed one repaints what is
      // left of the stroke the moment the tip touches it.
      if (run.length >= 2) {
        next.push(
          makeStroke(run, {
            color: stroke.color,
            width: stroke.width,
            opacity: strokeOpacity(stroke),
            kind: stroke.kind,
          }),
        )
      }
    }
  }
  return changed ? next : null
}

// Split a polyline into the runs that lie OUTSIDE a disk (eraser tip), cutting
// segments where they cross the disk boundary. Returns the point-runs plus
// `touched`: whether any part of the path fell inside the disk. The caller cannot
// infer that from the runs — clipping one end segment yields a single run of the
// same length as the original path.
function splitStrokeByErase(points, center, radius) {
  const r2 = radius * radius
  const runs = []
  let touched = false
  let run = []
  const dist2 = (p) => (p.x - center.x) ** 2 + (p.y - center.y) ** 2
  const push = (p) => {
    const last = run[run.length - 1]
    if (!last || last.x !== p.x || last.y !== p.y) run.push(p)
  }
  const cut = () => {
    if (run.length >= 2) runs.push(run)
    run = []
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    const bounds = [0, ...circleSegmentTs(a, b, center, radius), 1]
    for (let k = 0; k < bounds.length - 1; k += 1) {
      const t0 = bounds[k]
      const t1 = bounds[k + 1]
      const mid = (t0 + t1) / 2
      const pm = { x: a.x + (b.x - a.x) * mid, y: a.y + (b.y - a.y) * mid }
      if (dist2(pm) <= r2) {
        touched = true
        cut() // this sub-segment is inside the tip → break the run
      } else {
        push({ x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 })
        push({ x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 })
      }
    }
  }
  cut()
  return { runs, touched }
}

// The t-values in (0,1) where segment a→b CROSSES the circle of `radius` at
// `center`, sorted. Solves |a + t(b-a) - c|² = r². A tangent (disc === 0) is
// deliberately not reported: the segment only grazes the circle at a single
// point, so every other point of it is outside and there is no ink to cut — a
// boundary there would just insert a duplicate vertex.
function circleSegmentTs(a, b, center, radius) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const aa = dx * dx + dy * dy
  if (aa === 0) return []
  const fx = a.x - center.x
  const fy = a.y - center.y
  const bb = 2 * (fx * dx + fy * dy)
  const cc = fx * fx + fy * fy - radius * radius
  const disc = bb * bb - 4 * aa * cc
  if (disc <= 0) return []
  const sq = Math.sqrt(disc)
  const ts = [(-bb - sq) / (2 * aa), (-bb + sq) / (2 * aa)].filter((t) => t > 0 && t < 1)
  return ts.sort((m, n) => m - n)
}
