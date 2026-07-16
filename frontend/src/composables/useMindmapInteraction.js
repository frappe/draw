// Node-level pointer interaction for mind maps (spec A5/M4): drag a node onto
// another to re-parent (cycles blocked), or drag among siblings to reorder. Mind
// map is auto-layout (strategy.handlesSurfaceInteraction is false), so this works
// on the NODES, not the canvas surface — the node layer calls startDrag() on a
// node's pointerdown. Everything routes through the shared viewport transform so
// hit-testing is correct at any zoom (Part G4).

import { reactive, onScopeDispose } from 'vue'
import { reparentNode, reorderNode } from '@/diagram/mindmapOperations.js'
import { nodeById, isDescendant } from '@/diagram/mindmapModel.js'
import { isNodeHidden } from '@/diagram/mindmapLayout.js'
import { rectsIntersect } from '@/diagram/geometry.js'
import { selectNode } from '@/stores/mindmapUi.js'
import { isAdditiveEvent, clientToLogical, runMarqueeDrag } from '@/composables/pointer.js'

const DRAG_THRESHOLD = 5 // canvas units before a press becomes a drag
const MARQUEE_MIN = 3 // canvas units below which a drag counts as a click

export function useMindmapInteraction(store, viewport, positionsRef) {
  // dropTargetId is highlighted while a re-parent drag hovers a valid target.
  const drag = reactive({ active: false, nodeId: null, dx: 0, dy: 0, dropTargetId: null })
  // Live rubber-band box {x,y,w,h} in canvas units while marquee-selecting, else null.
  const marquee = reactive({ box: null })
  // Whether the most recent node gesture actually moved (a drag) vs was a click.
  // The node layer reads this to decide click-to-edit (N5) without firing on drags.
  const gesture = reactive({ moved: false })

  function startDrag(event, nodeId, surfaceRect) {
    if (event.button !== 0) return
    gesture.moved = false
    selectNode(store, nodeId)
    const start = clientToLogical(event, surfaceRect, viewport)
    const session = { nodeId, start, surfaceRect, moved: false }
    bindWindow(session)
  }

  // Track the move; resolve the hovered node as a potential drop target.
  // Tracks the active drag's listener-removal so an unmount mid-drag (undo that
  // swaps the diagram, type switch, route change) doesn't leave window listeners
  // attached — a later stray pointerup would otherwise run applyDrop against
  // whatever diagram is current.
  let releaseDrag = null
  function bindWindow(session) {
    const onMove = (event) => onDragMove(event, session)
    const onUp = (event) => {
      releaseDrag?.()
      onDragEnd(event, session)
    }
    releaseDrag = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      releaseDrag = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  onScopeDispose(() => releaseDrag?.())

  function onDragMove(event, session) {
    const point = clientToLogical(event, session.surfaceRect, viewport)
    const dx = point.x - session.start.x
    const dy = point.y - session.start.y
    if (!session.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    session.moved = true
    gesture.moved = true
    drag.active = true
    drag.nodeId = session.nodeId
    drag.dx = dx
    drag.dy = dy
    drag.dropTargetId = dropTargetAt(point, session.nodeId)
  }

  function onDragEnd(event, session) {
    const wasDrag = session.moved
    const targetId = drag.dropTargetId
    resetDrag()
    if (!wasDrag) return
    applyDrop(session.nodeId, targetId)
  }

  // Dropping onto another node re-parents; releasing over empty space near
  // siblings is treated as a no-op (reorder uses Alt+Arrows / explicit handles).
  function applyDrop(nodeId, targetId) {
    if (targetId && targetId !== nodeId) reparentNode(store, nodeId, targetId)
  }

  // Topmost node whose box contains `point`, excluding the dragged node, its own
  // descendants (would create a cycle, A12), and its current parent (no-op move).
  function dropTargetAt(point, draggedId) {
    const model = store.state.mindmap
    if (!model) return null
    const dragged = nodeById(model, draggedId)
    for (const node of model.nodes) {
      if (node.id === draggedId || isDescendant(model, draggedId, node.id)) continue
      if (node.id === dragged?.parentId) continue
      if (boxContains(positionsRef.value?.[node.id], point)) return node.id
    }
    return null
  }

  function resetDrag() {
    drag.active = false
    drag.nodeId = null
    drag.dropTargetId = null
    drag.dx = 0
    drag.dy = 0
  }

  // ----- marquee (rubber-band) selection on empty canvas -----------------------
  // Nodes are auto-laid-out, so this is purely for bulk-selecting (recolor/delete)
  // + highlighting. A plain press clears the selection, an additive press keeps it;
  // either way a drag grows a box that selects intersected nodes on release. The
  // node layer wires this to a transparent background <rect> behind the nodes (the
  // canvas surface early-returns for mind maps). Client→logical is undo-pan then
  // undo-zoom against the shared viewport + the canvas surface rect (Part G4).
  function beginMarquee(event) {
    if (event.button !== 0) return
    const additive = isAdditiveEvent(event)
    if (!additive) store.clearSelection()
    const surface = event.target.closest('[data-fdpreset]')
    const surfaceRect = surface ? surface.getBoundingClientRect() : { left: 0, top: 0 }
    const start = clientToLogical(event, surfaceRect, viewport)
    marquee.box = { x: start.x, y: start.y, w: 0, h: 0 }
    runMarqueeDrag({
      start,
      rect: surfaceRect,
      viewport,
      onUpdate: (box) => (marquee.box = box),
      onDone: () => finishMarquee(additive),
    })
  }

  // On release, select every visible node whose layout box intersects the marquee.
  // A sub-3px box is treated as a click (selection already cleared if not additive).
  function finishMarquee(additive) {
    const box = marquee.box
    marquee.box = null
    if (!box || box.w < MARQUEE_MIN || box.h < MARQUEE_MIN) return
    const model = store.state.mindmap
    const positions = positionsRef.value || {}
    if (!model) return
    const ids = model.nodes
      .filter((node) => positions[node.id] && !isNodeHidden(model, node.id))
      .filter((node) => rectsIntersect(box, positions[node.id]))
      .map((node) => node.id)
    if (!ids.length) return
    additive ? store.addToSelection(ids) : store.select(ids)
  }

  return {
    drag,
    marquee,
    gesture,
    startDrag,
    beginMarquee,
    reorderSelected: (id, dir) => reorderNode(store, id, dir),
  }
}

function boxContains(box, point) {
  if (!box) return false
  return point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h
}
