// Click-drag marquee selection on empty canvas (spec §7.2). begin() starts a
// drag in logical units; rect tracks the live selection box for rendering inside
// the canvas <g>; on release the intersected shapes are selected. Shift adds to
// the existing selection rather than replacing it.
import { ref } from 'vue'
import { axisAlignedBBox, rectsIntersect, anchorPoint } from '@/diagram/geometry.js'
import { isInteractable } from '@/diagram/shapeFlags.js'
import { ROLE } from '@/diagram/freeFloating.js'
import { whiteboardObjectBoxes } from '@/diagram/whiteboardModel.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'

const MIN_DRAG = 3

// Connectors nothing authored: flattenSubmodels rebuilds each of these from the
// node tree, so none of them can be deleted or edited on its own.
const DERIVED_ROLES = new Set([ROLE.mindmapBranch, ROLE.mindmapCrosslink, ROLE.flowchartEdge])

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
    window.removeEventListener('pointercancel', handleUp)
    onEnd()
  }
  window.addEventListener('pointermove', handleMove)
  window.addEventListener('pointerup', handleUp)
  // Also finish on pointercancel (a touch scroll claiming the gesture): otherwise
  // these window listeners leak and the live marquee rect is never cleared.
  window.addEventListener('pointercancel', handleUp)
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

// On release, select everything the box caught, then clear.
//
// ONE box selects everything (#506): block shapes, connectors, and the whiteboard's
// own ink, stickies, lines and tables. This function used to read shapes and
// connectors only and never look at state.whiteboard, so on the unified canvas —
// where the select tool does NOT delegate to the whiteboard layer, and this is the
// marquee that runs — a box dragged over a pen stroke or a table caught nothing.
// The hit test it needed already existed on the other side, in whiteboardObjectBoxes.
function finish(store, rect, additive) {
  const box = rect.value
  rect.value = null
  if (!box || box.w < MIN_DRAG || box.h < MIN_DRAG) return
  const shapeIds = store.state.shapes
    .filter((shape) => isInteractable(shape) && rectsIntersect(box, axisAlignedBBox(shape)))
    .map((shape) => shape.id)
  const connectorIds = (store.state.connectors || [])
    .filter((connector) => isMarqueeSelectable(connector) && rectsIntersect(box, connectorBox(store, connector)))
    .map((connector) => connector.id)
  const objects = whiteboardObjectBoxes(store.state.whiteboard || {})
    .filter((object) => rectsIntersect(box, object.box))
    .map(({ kind, id }) => ({ kind, id }))
  // Keep groups atomic: if any group member is in the box, take the whole group.
  const ids = [...store.expandGroups(shapeIds), ...connectorIds]
  if (ids.length || objects.length) applySelection(store, ids, objects, additive)
}

// Write one marquee result across BOTH selection models. They normally clear each
// other (#416) — store.select drops the board's selection and setSelection drops the
// shapes — which is right for a click and wrong for a box that caught both. So the
// two are written in that order with the keepShapes opt-out store.selectAll already
// uses for Cmd+A, which is the same "these belong together" case.
//
// A non-additive drag writes both even when a side is empty, so the previous
// selection on that side is cleared rather than left behind.
function applySelection(store, ids, objects, additive) {
  const whiteboardUi = useWhiteboardUi()
  if (additive) {
    if (ids.length) store.addToSelection(ids)
    if (objects.length) whiteboardUi.addToSelection(objects, { keepShapes: true })
    return
  }
  store.select(ids)
  whiteboardUi.setSelection(objects, { keepShapes: true })
}

// A connector the user authored, rather than one derived from a node tree (#512).
//
// Branches, cross-links and flowchart edges are rebuilt from the model on every
// load, so nothing can delete them — selecting one gave the user a handle that
// answers to nothing, which is exactly what the report showed: two nodes picked by
// a box, plus a third node's branch, and Delete doing nothing to it.
function isMarqueeSelectable(connector) {
  return !DERIVED_ROLES.has(connector.role)
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
