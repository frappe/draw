// Click-drag marquee selection on empty canvas (spec §7.2). begin() starts a
// drag in logical units; rect tracks the live selection box for rendering inside
// the canvas <g>; on release the intersected shapes are selected. Shift adds to
// the existing selection rather than replacing it.
import { ref } from 'vue'
import { axisAlignedBBox, rectsIntersect, anchorPoint } from '@/diagram/geometry.js'
import { isInteractable } from '@/diagram/shapeFlags.js'

const MIN_DRAG = 3

export function useMarquee(store) {
  const rect = ref(null)

  function begin({ toLogical, start, additive }) {
    runDrag(toLogical, (point) => updateRect(rect, start, point), () => finish(store, rect, additive))
  }

  return { rect, begin }
}

// Window-level pointer listeners converting each event to a logical point.
function runDrag(toLogical, onMove, onEnd) {
  function handleMove(event) {
    onMove(toLogical(event))
  }
  function handleUp() {
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', handleUp)
    onEnd()
  }
  window.addEventListener('pointermove', handleMove)
  window.addEventListener('pointerup', handleUp)
}

// Normalise the drag into a positive-size rect in logical units.
function updateRect(rect, start, point) {
  rect.value = {
    x: Math.min(start.x, point.x),
    y: Math.min(start.y, point.y),
    w: Math.abs(point.x - start.x),
    h: Math.abs(point.y - start.y),
  }
}

// On release, select every shape AND connector whose AABB intersects the
// marquee, then clear. Connectors were previously skipped, so dragging a box
// over arrows never picked them up (spec §7.2).
function finish(store, rect, additive) {
  const box = rect.value
  rect.value = null
  if (!box || box.w < MIN_DRAG || box.h < MIN_DRAG) return
  const shapeIds = store.state.shapes
    .filter((shape) => isInteractable(shape) && rectsIntersect(box, axisAlignedBBox(shape)))
    .map((shape) => shape.id)
  const connectorIds = (store.state.connectors || [])
    .filter((connector) => rectsIntersect(box, connectorBox(store, connector)))
    .map((connector) => connector.id)
  // Keep groups atomic: if any group member is in the box, take the whole group.
  const ids = [...store.expandGroups(shapeIds), ...connectorIds]
  if (ids.length) additive ? store.addToSelection(ids) : store.select(ids)
}

// AABB of a connector from its two resolved endpoints (attached or free), padded
// a little so a thin near-axis-aligned line still has a hittable box.
function connectorBox(store, connector) {
  const a = resolveEndpoint(store, connector.from)
  const b = resolveEndpoint(store, connector.to)
  const pad = 4
  return {
    x: Math.min(a.x, b.x) - pad,
    y: Math.min(a.y, b.y) - pad,
    w: Math.abs(b.x - a.x) + pad * 2,
    h: Math.abs(b.y - a.y) + pad * 2,
  }
}

function resolveEndpoint(store, endpoint) {
  if (endpoint?.shapeId) {
    const shape = store.shapeById(endpoint.shapeId)
    if (shape) return anchorPoint(shape, endpoint.anchor || 'right')
  }
  return { x: endpoint?.x || 0, y: endpoint?.y || 0 }
}
