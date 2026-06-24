// Node-level pointer interaction for mind maps (spec A5/M4): drag a node onto
// another to re-parent (cycles blocked), or drag among siblings to reorder. Mind
// map is auto-layout (strategy.handlesSurfaceInteraction is false), so this works
// on the NODES, not the canvas surface — the node layer calls startDrag() on a
// node's pointerdown. Everything routes through the shared viewport transform so
// hit-testing is correct at any zoom (Part G4).

import { reactive } from 'vue'
import { reparentNode, reorderNode } from '@/diagram/mindmapOperations.js'
import { nodeById, isDescendant } from '@/diagram/mindmapModel.js'
import { selectNode } from '@/stores/mindmapUi.js'

const DRAG_THRESHOLD = 5 // canvas units before a press becomes a drag

export function useMindmapInteraction(store, viewport, positionsRef) {
  // dropTargetId is highlighted while a re-parent drag hovers a valid target.
  const drag = reactive({ active: false, nodeId: null, dx: 0, dy: 0, dropTargetId: null })

  function startDrag(event, nodeId, surfaceRect) {
    if (event.button !== 0) return
    selectNode(store, nodeId)
    const start = toCanvas(event, surfaceRect, viewport)
    const session = { nodeId, start, surfaceRect, moved: false }
    bindWindow(session)
  }

  // Track the move; resolve the hovered node as a potential drop target.
  function bindWindow(session) {
    const onMove = (event) => onDragMove(event, session)
    const onUp = (event) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      onDragEnd(event, session)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function onDragMove(event, session) {
    const point = toCanvas(event, session.surfaceRect, viewport)
    const dx = point.x - session.start.x
    const dy = point.y - session.start.y
    if (!session.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    session.moved = true
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

  return { drag, startDrag, reorderSelected: (id, dir) => reorderNode(store, id, dir) }
}

function boxContains(box, point) {
  if (!box) return false
  return point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h
}

// Client coords -> canvas units via the shared viewport transform (Part G4).
function toCanvas(event, rect, viewport) {
  const { panX, panY, zoom } = viewport.state
  return {
    x: (event.clientX - rect.left - panX) / zoom,
    y: (event.clientY - rect.top - panY) / zoom,
  }
}
