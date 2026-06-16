// Snap-to-anchor connector drawing (spec §5.3). In draw mode with a connector
// type armed, pressing near a shape snaps the start to that shape's nearest of
// eight circular anchors, dragging shows a live preview, releasing snaps the
// end to another shape (or leaves it free on empty canvas). Selecting a
// connector lets its endpoints be re-dragged to re-attach or detach.

import { reactive, computed } from 'vue'
import { ANCHOR_NAMES, anchorPoint } from '@/diagram/geometry.js'

const CONNECTOR_TYPES = ['straight', 'curved', 'elbow']
const SNAP_RADIUS = 26
const FIXED_ANGLES = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330]

// The eight anchors of a shape as world points, tagged with their name.
function shapeAnchors(shape) {
  return ANCHOR_NAMES.map((name) => ({ name, ...anchorPoint(shape, name) }))
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// Nearest anchor on any shape within the snap radius, else null.
function nearestAnchor(shapes, point) {
  let best = null
  for (const shape of shapes) {
    for (const anchor of shapeAnchors(shape)) {
      const gap = distance(anchor, point)
      if (gap <= SNAP_RADIUS && (!best || gap < best.gap)) {
        best = { shapeId: shape.id, anchor: anchor.name, point: anchor, gap }
      }
    }
  }
  return best
}

// Constrain a vector from origin to one of the fixed angle directions (Shift).
function snapToFixedAngle(origin, point) {
  const length = distance(origin, point)
  const current = (Math.atan2(point.y - origin.y, point.x - origin.x) * 180) / Math.PI
  const target = FIXED_ANGLES.reduce((best, angle) => {
    const candidate = angle > 180 ? angle - 360 : angle
    return Math.abs(candidate - current) < Math.abs(best - current) ? candidate : best
  }, 0)
  const radians = (target * Math.PI) / 180
  return { x: origin.x + Math.cos(radians) * length, y: origin.y + Math.sin(radians) * length }
}

export function useConnectorDrawing(store, editorUi) {
  const draft = reactive({ active: false, type: 'straight', start: null, end: null, hoverShapeId: null })

  const isDrawingConnector = computed(
    () => editorUi.state.tool === 'draw' && CONNECTOR_TYPES.includes(editorUi.state.drawShapeType),
  )

  // Resolve an endpoint descriptor (attached or free) to a tagged anchor object.
  function endpointFrom(point, shiftKey, origin) {
    const snapped = nearestAnchor(store.state.shapes, point)
    if (snapped) return snapped
    const free = shiftKey && origin ? snapToFixedAngle(origin, point) : point
    return { point: { x: free.x, y: free.y } }
  }

  function beginDraw(point) {
    const hit = endpointFrom(point, false)
    draft.active = true
    draft.type = editorUi.state.drawShapeType
    draft.start = hit
    draft.end = hit
  }

  function updateDraw(point, shiftKey) {
    if (!draft.active) return
    draft.end = endpointFrom(point, shiftKey, draft.start.point)
    draft.hoverShapeId = draft.end.shapeId || null
  }

  // Turn a tagged anchor into a stored endpoint. Both shapes of keys are always
  // present (the unused pair nulled) so updateConnector's plain-object merge
  // overwrites cleanly instead of leaving a stale attachment behind.
  function toEndpoint(hit) {
    if (hit.shapeId) return { shapeId: hit.shapeId, anchor: hit.anchor, x: null, y: null }
    return { shapeId: null, anchor: null, x: Math.round(hit.point.x), y: Math.round(hit.point.y) }
  }

  function commitDraw() {
    if (!draft.active) return null
    const from = toEndpoint(draft.start)
    const to = toEndpoint(draft.end)
    draft.active = false
    draft.hoverShapeId = null
    if (distance(draft.start.point, draft.end.point) < 6) return null
    const id = store.addConnector({ type: draft.type, from, to })
    editorUi.setTool('select')
    store.select(id)
    return id
  }

  function cancelDraw() {
    draft.active = false
    draft.hoverShapeId = null
  }

  // Endpoint re-drag for a selected connector: re-attach or detach an end.
  function moveEndpoint(connectorId, which, point) {
    const hit = endpointFrom(point, false)
    store.updateConnector(connectorId, { [which]: toEndpoint(hit) })
  }

  return {
    draft,
    isDrawingConnector,
    nearestAnchor: (point) => nearestAnchor(store.state.shapes, point),
    shapeAnchors,
    beginDraw,
    updateDraw,
    commitDraw,
    cancelDraw,
    moveEndpoint,
    CONNECTOR_TYPES,
  }
}
