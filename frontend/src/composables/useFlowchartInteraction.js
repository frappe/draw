// Flowchart surface interaction (spec diagram-types Part B, F2/F4, Part G1/G4).
// Owns the flowchart's pointer behaviour, registered into the shared
// modeInteraction seam so DiagramCanvas delegates surface events here:
//   - dragging a node (sets manuallyPositioned, Part G7),
//   - clicking empty canvas to clear the flowchart selection,
//   - dragging a connector from a node port to empty canvas -> node-type picker
//     -> create a connected node there (F4 drag-to-empty).
// The "+" handle clicks and picker choices are driven from FlowchartLayer via the
// helpers this returns; both routes funnel through createConnectedNode so node
// creation, auto-connect and auto-position stay one undoable unit each (G6).
// Every point arrives already in canvas units (Part G4).

import { reactive } from 'vue'
import { registerModeInteraction } from '@/composables/useModeInteraction.js'
import {
  nodeSize,
  flowchartNodeById,
  makeFlowchartNode,
  makeFlowchartEdge,
  defaultNodeText,
} from '@/diagram/flowchartModel.js'
import { placeChild, routeEdge, reflowAuto } from '@/diagram/flowchartLayout.js'

export function useFlowchartInteraction(store, editorUi, interactionRef) {
  // Transient UI state the layer renders against (not part of the document).
  const ui = reactive({
    hoverNodeId: null, // node whose + handles show
    // Picker request: { x, y, source }, where source describes what creating a
    // node should connect to. Null when the picker is closed.
    picker: null,
    pendingLink: null, // a connector drag in progress from a port
  })

  const drag = { active: false, nodeId: null, startX: 0, startY: 0, originX: 0, originY: 0 }
  const link = { active: false, fromNodeId: null, fromPort: null, moved: false }

  // ----- node selection helpers ----------------------------------------------

  function selectedNode() {
    const id = store.state.selection[0]
    return id ? flowchartNodeById(store.state.flowchart, id) : null
  }

  // ----- pointer handlers (registered with the canvas) ------------------------

  function onPointerDown(event, context) {
    if (event.button !== 0) return
    ui.picker = null
    // The layer marks the node/port a press started on via dataset attributes on
    // the SVG group; read them off the event target chain.
    const hit = hitTarget(event.target)
    if (hit?.type === 'port') return beginLink(hit.nodeId, hit.port, context.point)
    if (hit?.type === 'node') return beginDrag(hit.nodeId, context.point)
    store.clearSelection()
  }

  function onPointerMove(event, context) {
    if (drag.active) return moveDrag(context.point)
    if (link.active) return moveLink(context.point)
  }

  function onPointerUp(event, context) {
    if (drag.active) return endDrag()
    if (link.active) return endLink(context.point)
  }

  function onDoubleClick(event, context) {
    // Node text editing is owned by the layer (it stops propagation), so a
    // surface double-click is always on empty canvas: drop a process node there
    // so an empty flowchart can be started from scratch.
    createConnectedNode('process', null, context.point.x, context.point.y)
    return true
  }

  // ----- node drag (manual placement, G7) -------------------------------------

  function beginDrag(nodeId, point) {
    const node = flowchartNodeById(store.state.flowchart, nodeId)
    if (!node) return
    store.select([nodeId])
    drag.active = true
    drag.nodeId = nodeId
    drag.startX = point.x
    drag.startY = point.y
    drag.originX = node.x
    drag.originY = node.y
  }

  function moveDrag(point) {
    const node = flowchartNodeById(store.state.flowchart, drag.nodeId)
    if (!node) return
    // Live-update position without committing every frame; commit on drop.
    node.x = Math.round(drag.originX + (point.x - drag.startX))
    node.y = Math.round(drag.originY + (point.y - drag.startY))
  }

  function endDrag() {
    const node = flowchartNodeById(store.state.flowchart, drag.nodeId)
    drag.active = false
    if (!node) return
    const finalX = node.x
    const finalY = node.y
    // Restore the pre-drag position then commit the move as one undoable unit
    // (the live drag mutated state outside history). A click with no movement
    // selects only — no commit, so a plain click never marks the node manual.
    node.x = drag.originX
    node.y = drag.originY
    if (finalX === drag.originX && finalY === drag.originY) return
    // Dropped onto a connector it isn't already part of -> splice it into the
    // flow and reflow downstream as ONE undoable unit (spec B7/F5, Part G6).
    const edge = edgeUnderNode(node, finalX, finalY)
    if (edge) return insertOnEdge(node, edge, finalX, finalY)
    store.updateFlowchartNode(node.id, { x: finalX, y: finalY, manuallyPositioned: true })
  }

  // Find a flow edge whose route passes under a node dropped at (x,y), excluding
  // edges already touching that node (so re-dragging a connected node is a move).
  function edgeUnderNode(node, x, y) {
    const model = store.state.flowchart
    const size = nodeSize(node)
    const center = { x: x + size.w / 2, y: y + size.h / 2 }
    for (const edge of model.edges) {
      if (edge.from.nodeId === node.id || edge.to.nodeId === node.id) continue
      const route = routeEdge(model, edge)
      if (route && distanceToPolyline(center, route.points) <= 14) return edge
    }
    return null
  }

  // Re-wire edge A->B into A->node->B (preserving the branch label on A->node),
  // place the node on the drop point, then reflow non-manual nodes downstream.
  function insertOnEdge(node, edge, x, y) {
    store.updateFlowchartModel('Insert node', (model) => {
      const target = model.edges.find((e) => e.id === edge.id)
      const downstream = target.to.nodeId
      const downstreamPort = target.to.port
      target.to = { nodeId: node.id, port: 'in' }
      model.edges.push(
        makeFlowchartEdge(node.id, downstream, { fromPort: 'out', toPort: downstreamPort }),
      )
      const inserted = flowchartNodeById(model, node.id)
      inserted.x = x
      inserted.y = y
      inserted.manuallyPositioned = false
      reflowAuto(model, [node.id])
    })
  }

  // ----- connector drag-to-empty (F4) -----------------------------------------

  function beginLink(nodeId, port, point) {
    link.active = true
    link.fromNodeId = nodeId
    link.fromPort = port
    link.moved = false
    ui.pendingLink = { from: point, to: point }
  }

  function moveLink(point) {
    link.moved = true
    if (ui.pendingLink) ui.pendingLink.to = point
  }

  function endLink(point) {
    const wasMoved = link.moved
    const from = { nodeId: link.fromNodeId, port: link.fromPort }
    link.active = false
    ui.pendingLink = null
    // A tap on the "+" handle (no drag) opens the picker next to the handle so
    // the next node is created + auto-positioned below (spec B4/F2).
    if (!wasMoved) {
      const offset = (store.state.flowchart.direction || 'TB') === 'LR' ? { x: 36, y: 0 } : { x: 0, y: 36 }
      openPicker(point.x + offset.x, point.y + offset.y, { fromNodeId: from.nodeId, fromPort: from.port })
      return
    }
    // Dragged onto a node -> connect to it; dragged to empty -> open the picker
    // there to create + connect a new node (spec F4 drag-to-empty).
    const target = nodeAtPoint(point)
    if (target && target.id !== from.nodeId) {
      store.addFlowchartEdge(from.nodeId, target.id, { fromPort: from.port })
      return
    }
    openPicker(point.x, point.y, { fromNodeId: from.nodeId, fromPort: from.port })
  }

  function nodeAtPoint(point) {
    return store.state.flowchart.nodes.find((node) => pointInNode(point, node)) || null
  }

  // ----- picker + node creation (F2/F4) ---------------------------------------

  // Open the node-type picker at a logical point; `source` records how a chosen
  // node should be connected (a + handle on a node, or a dragged connector).
  function openPicker(x, y, source) {
    ui.picker = { x, y, source }
  }

  function closePicker() {
    ui.picker = null
  }

  // Create a node of `nodeType` and connect it per the open picker's source, as
  // ONE undoable unit (Part G6). Auto-positions snapped to the column/lane (F2).
  function chooseNodeType(nodeType) {
    const request = ui.picker
    ui.picker = null
    if (!request) return
    createConnectedNode(nodeType, request.source, request.x, request.y)
  }

  // Shared creation path for both + handles and drag-to-empty. `source` is
  // { fromNodeId, fromPort } (connect from an existing node) or null (free node).
  function createConnectedNode(nodeType, source, fallbackX, fallbackY) {
    store.updateFlowchartModel('Add node', (model) => {
      const position = positionFor(model, nodeType, source, fallbackX, fallbackY)
      const id = pushNode(model, nodeType, position)
      if (source?.fromNodeId) connectFromSource(model, source, id)
      store.select([id])
    })
  }

  // A new node either auto-places under its parent (column/lane snap) or, for a
  // free drag-to-empty drop, sits centred on the drop point.
  function positionFor(model, nodeType, source, fallbackX, fallbackY) {
    const draft = { nodeType, x: fallbackX, y: fallbackY }
    const size = nodeSize(draft)
    if (!source?.fromNodeId) return { x: Math.round(fallbackX - size.w / 2), y: Math.round(fallbackY - size.h / 2) }
    const parent = flowchartNodeById(model, source.fromNodeId)
    const branchCount = parent?.nodeType === 'decision' ? parent.branches.length : 1
    const branchIndex = decisionBranchIndex(parent, source.fromPort)
    return placeChild(model, source.fromNodeId, { ...draft, ...size }, branchIndex, branchCount)
  }

  function decisionBranchIndex(parent, port) {
    if (!parent || parent.nodeType !== 'decision') return null
    const index = parent.branches.findIndex((branch) => branch.port === port)
    return index < 0 ? null : index
  }

  function pushNode(model, nodeType, position) {
    const node = makeNode(model, nodeType, position)
    model.nodes.push(node)
    return node.id
  }

  function connectFromSource(model, source, toId) {
    const edge = makeEdge(source.fromNodeId, source.fromPort, toId)
    edge.label = branchLabel(model, source)
    model.edges.push(edge)
  }

  function branchLabel(model, source) {
    const parent = flowchartNodeById(model, source.fromNodeId)
    if (!parent || parent.nodeType !== 'decision') return ''
    const branch = parent.branches.find((b) => b.port === source.fromPort)
    return branch?.label || ''
  }

  registerModeInteraction(interactionRef, {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onDoubleClick,
  })

  return { ui, selectedNode, openPicker, closePicker, chooseNodeType, createConnectedNode }
}

// ----- small pure helpers (kept module-local) --------------------------------

// Walk up from an event target to the nearest flowchart element carrying our
// data attributes, returning what kind of element was pressed.
function hitTarget(target) {
  let element = target
  while (element && element.getAttribute) {
    const port = element.getAttribute('data-fc-port')
    const node = element.getAttribute('data-fc-node')
    if (port && node) return { type: 'port', nodeId: node, port }
    if (node) return { type: 'node', nodeId: node }
    element = element.parentElement
  }
  return null
}

// Shortest distance from a point to a polyline (the elbow edge route).
function distanceToPolyline(point, points) {
  let best = Infinity
  for (let i = 0; i < points.length - 1; i += 1) {
    best = Math.min(best, distanceToSegment(point, points[i], points[i + 1]))
  }
  return best
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  if (!lengthSquared) return Math.hypot(point.x - a.x, point.y - a.y)
  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}

function pointInNode(point, node) {
  const size = nodeSize(node)
  return (
    point.x >= node.x &&
    point.x <= node.x + size.w &&
    point.y >= node.y &&
    point.y <= node.y + size.h
  )
}

// Build a node with the type's default text + stable id (model factory).
function makeNode(model, nodeType, position) {
  return makeFlowchartNode(nodeType, defaultNodeText(nodeType), position.x, position.y)
}

function makeEdge(fromNodeId, fromPort, toNodeId) {
  return makeFlowchartEdge(fromNodeId, toNodeId, { fromPort })
}
