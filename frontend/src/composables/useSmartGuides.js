// Smart alignment guides + snapping during drag (spec §7.6). While a shape is
// dragged we compare its axis-aligned edges/centers against every other shape
// and the canvas border/center, on both axes. Matches within a few pixels emit
// a pink guide line and a light, escapable snap.
//
// This is a per-store singleton so the transform-drag code and the
// SmartGuidesLayer share one live `guides` list without prop plumbing through
// the (Foundation-owned) DiagramCanvas. The drag code drives the math via
// snapDelta(); the layer renders `guides`.

import { ref, computed } from 'vue'
import { axisAlignedBBox } from '@/diagram/geometry.js'

// How close (in logical units) edges/centers must be to snap, and how long a
// guide line over-runs past the aligned shapes so it reads as a guide.
const SNAP_THRESHOLD = 6
const GUIDE_OVERSHOOT = 12

const instances = new WeakMap()

// One shared instance per document store so all callers see the same guides.
export function useSmartGuides(store) {
  if (!instances.has(store)) instances.set(store, createSmartGuides(store))
  return instances.get(store)
}

function createSmartGuides(store) {
  const guides = ref([])
  const measurements = ref([])
  const active = ref(false)
  const visible = computed(() => (active.value ? guides.value : []))
  const visibleMeasurements = computed(() => (active.value ? measurements.value : []))
  const publisher = createFramePublisher((lines) => (guides.value = lines))
  const measurePublisher = createFramePublisher((items) => (measurements.value = items))

  // Adjust a proposed drag delta so the dragged shapes lock onto alignment,
  // and publish the guide lines for the match. The snap correction returns
  // synchronously every call so movement stays smooth; the visible guide lines
  // are published at most once per animation frame (spec §7.6 throttling).
  // Live spacing measurements to the nearest neighbours are published the same
  // way (spec 4.2), using the box's FINAL (post-snap) position.
  function snapDelta(draggedIds, originals, rawDelta) {
    if (!draggedIds || !draggedIds.length) return rawDelta
    active.value = true
    const moving = movedBBox(store, draggedIds, originals, rawDelta)
    const targets = targetEdges(store, draggedIds)
    const result = resolveSnap(moving, targets, store.state.canvas)
    publisher.publish(result.lines)
    const settled = { x: moving.x + result.dx, y: moving.y + result.dy, w: moving.w, h: moving.h }
    measurePublisher.publish(spacingMeasurements(store, draggedIds, settled))
    return { x: rawDelta.x + result.dx, y: rawDelta.y + result.dy }
  }

  function clear() {
    publisher.cancel()
    measurePublisher.cancel()
    active.value = false
    guides.value = []
    measurements.value = []
  }

  return { guides: visible, measurements: visibleMeasurements, snapDelta, clear, store }
}

// Coalesce rapid guide updates into one per animation frame so the SVG layer
// re-renders at most 60fps no matter how fast pointermove fires (spec §7.6).
// Falls back to a synchronous commit where requestAnimationFrame is absent
// (e.g. non-browser test environments) so the math stays exercisable.
function createFramePublisher(commit) {
  const schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null
  const unschedule = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : null
  let pending = null
  let frame = null
  const flush = () => {
    frame = null
    commit(pending)
  }
  return {
    publish(lines) {
      pending = lines
      if (!schedule) return commit(lines)
      if (frame === null) frame = schedule(flush)
    },
    cancel() {
      if (unschedule && frame !== null) unschedule(frame)
      frame = null
      pending = null
    },
  }
}

// The combined axis-aligned box of the dragged selection after a raw delta.
function movedBBox(store, ids, originals, delta) {
  const boxes = ids.map((id) => shiftedBBox(store, id, originals, delta))
  return unionBox(boxes)
}

function shiftedBBox(store, id, originals, delta) {
  const original = (originals || []).find((o) => o.id === id)
  const box = axisAlignedBBox(original || store.shapeById(id))
  return { x: box.x + delta.x, y: box.y + delta.y, w: box.w, h: box.h }
}

function unionBox(boxes) {
  const minX = Math.min(...boxes.map((b) => b.x))
  const minY = Math.min(...boxes.map((b) => b.y))
  const maxX = Math.max(...boxes.map((b) => b.x + b.w))
  const maxY = Math.max(...boxes.map((b) => b.y + b.h))
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

// Candidate alignment positions on each axis: every static shape's edges and
// center, plus the canvas border and center (spec §7.6).
function targetEdges(store, draggedIds) {
  const dragged = new Set(draggedIds)
  const boxes = store.state.shapes
    .filter((shape) => !dragged.has(shape.id))
    .map((shape) => axisAlignedBBox(shape))
  const targets = { vertical: [], horizontal: [] }
  for (const box of boxes) collectBoxLines(box, targets)
  collectCanvasLines(store.state.canvas, targets)
  return targets
}

// A box contributes three vertical lines (left/center/right) and three
// horizontal lines (top/middle/bottom), each tagged with the box's span so the
// rendered guide can stretch to cover both shapes.
function collectBoxLines(box, targets) {
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  targets.vertical.push(
    { pos: box.x, span: [box.y, box.y + box.h] },
    { pos: cx, span: [box.y, box.y + box.h] },
    { pos: box.x + box.w, span: [box.y, box.y + box.h] },
  )
  targets.horizontal.push(
    { pos: box.y, span: [box.x, box.x + box.w] },
    { pos: cy, span: [box.x, box.x + box.w] },
    { pos: box.y + box.h, span: [box.x, box.x + box.w] },
  )
}

function collectCanvasLines(canvas, targets) {
  const span = (a, b) => [a, b]
  targets.vertical.push(
    { pos: 0, span: span(0, canvas.height) },
    { pos: canvas.width / 2, span: span(0, canvas.height) },
    { pos: canvas.width, span: span(0, canvas.height) },
  )
  targets.horizontal.push(
    { pos: 0, span: span(0, canvas.width) },
    { pos: canvas.height / 2, span: span(0, canvas.width) },
    { pos: canvas.height, span: span(0, canvas.width) },
  )
}

// Find the best (closest) vertical and horizontal match for the moving box and
// build the snap correction plus the guide lines to draw.
function resolveSnap(moving, targets, canvas) {
  const vertical = bestMatch(movingVerticals(moving), targets.vertical)
  const horizontal = bestMatch(movingHorizontals(moving), targets.horizontal)
  const lines = []
  if (vertical) lines.push(verticalGuide(vertical, moving, canvas))
  if (horizontal) lines.push(horizontalGuide(horizontal, moving, canvas))
  return { dx: vertical ? vertical.delta : 0, dy: horizontal ? horizontal.delta : 0, lines }
}

// The three snappable x positions of the moving box: left, center, right.
function movingVerticals(box) {
  return [
    { name: 'left', value: box.x },
    { name: 'centre', value: box.x + box.w / 2 },
    { name: 'right', value: box.x + box.w },
  ]
}

function movingHorizontals(box) {
  return [
    { name: 'top', value: box.y },
    { name: 'middle', value: box.y + box.h / 2 },
    { name: 'bottom', value: box.y + box.h },
  ]
}

// Closest target within the snap threshold for any of the moving lines on one
// axis. Returns the correction delta, matched position, label, and target span.
function bestMatch(movingLines, targetLines) {
  let best = null
  for (const moving of movingLines) {
    for (const target of targetLines) {
      const gap = target.pos - moving.value
      if (Math.abs(gap) > SNAP_THRESHOLD) continue
      if (best && Math.abs(gap) >= Math.abs(best.delta)) continue
      best = { delta: gap, pos: target.pos, label: moving.name, span: target.span }
    }
  }
  return best
}

// A vertical guide line runs along the matched x, spanning both shapes.
function verticalGuide(match, moving, canvas) {
  const ys = [match.span[0], match.span[1], moving.y, moving.y + moving.h]
  const min = Math.max(0, Math.min(...ys) - GUIDE_OVERSHOOT)
  const max = Math.min(canvas.height, Math.max(...ys) + GUIDE_OVERSHOOT)
  return { x1: match.pos, y1: min, x2: match.pos, y2: max, label: match.label }
}

function horizontalGuide(match, moving, canvas) {
  const xs = [match.span[0], match.span[1], moving.x, moving.x + moving.w]
  const min = Math.max(0, Math.min(...xs) - GUIDE_OVERSHOOT)
  const max = Math.min(canvas.width, Math.max(...xs) + GUIDE_OVERSHOOT)
  return { x1: min, y1: match.pos, x2: max, y2: match.pos, label: match.label }
}

// ----- live spacing measurements (spec 4.2) ----------------------------------
// Only gaps to a neighbour that overlaps the moving box on the perpendicular
// axis are shown, capped to a readable distance so distant shapes don't clutter.
const MAX_GAP = 600

function spacingMeasurements(store, draggedIds, m) {
  const dragged = new Set(draggedIds)
  const boxes = store.state.shapes.filter((s) => !dragged.has(s.id)).map((s) => axisAlignedBBox(s))
  const out = []
  // Horizontal gaps: neighbours that overlap vertically, nearest on each side.
  const vOverlap = boxes.filter((b) => b.y < m.y + m.h && b.y + b.h > m.y)
  const left = nearest(vOverlap.filter((b) => b.x + b.w <= m.x + 0.5), (b) => -(b.x + b.w))
  const right = nearest(vOverlap.filter((b) => b.x >= m.x + m.w - 0.5), (b) => b.x)
  if (left) out.push(hGap(left.x + left.w, m.x, overlapMid(left.y, left.y + left.h, m.y, m.y + m.h)))
  if (right) out.push(hGap(m.x + m.w, right.x, overlapMid(right.y, right.y + right.h, m.y, m.y + m.h)))
  // Vertical gaps: neighbours that overlap horizontally.
  const hOverlap = boxes.filter((b) => b.x < m.x + m.w && b.x + b.w > m.x)
  const top = nearest(hOverlap.filter((b) => b.y + b.h <= m.y + 0.5), (b) => -(b.y + b.h))
  const bottom = nearest(hOverlap.filter((b) => b.y >= m.y + m.h - 0.5), (b) => b.y)
  if (top) out.push(vGap(top.y + top.h, m.y, overlapMid(top.x, top.x + top.w, m.x, m.x + m.w)))
  if (bottom) out.push(vGap(m.y + m.h, bottom.y, overlapMid(bottom.x, bottom.x + bottom.w, m.x, m.x + m.w)))
  return out.filter((g) => g.gap >= 1 && g.gap <= MAX_GAP)
}

// Smallest by `key` (ties arbitrary); null when the list is empty.
function nearest(list, key) {
  return list.reduce((best, b) => (best === null || key(b) < key(best) ? b : best), null)
}

function overlapMid(a1, a2, b1, b2) {
  return (Math.max(a1, b1) + Math.min(a2, b2)) / 2
}

function hGap(x1, x2, y) {
  const gap = x2 - x1
  return { kind: 'h', x1, x2, y1: y, y2: y, mx: (x1 + x2) / 2, my: y, gap, label: `${Math.round(gap)}` }
}

function vGap(y1, y2, x) {
  const gap = y2 - y1
  return { kind: 'v', x1: x, x2: x, y1, y2, mx: x, my: (y1 + y2) / 2, gap, label: `${Math.round(gap)}` }
}
