// Structure operations over the free-floating (free-floating #122) mind-map /
// flowchart shapes. These build the tagged shape (+ connector) for a new node,
// reusing the reconstruct-adapter for tree structure and the existing colour logic
// so a node added on the flattened canvas is indistinguishable from a migrated one.
// Pure builders (no store, no history) so they are unit-testable; the store wraps
// the returned objects in one commit().

import { createShape, createConnector, nextId } from './factories.js'
import { mindmapModelFromShapes, flowchartModelFromShapes, flowchartComponentIds } from './freeFloatingGraph.js'
import { resolveNodeColor, nodeFill, readableInk } from './mindmapColors.js'
import { makeFlowchartNode, defaultNodeText, nodeSize, pickFreeBranch } from './flowchartModel.js'
import { placeChild } from './flowchartLayout.js'
import { ROLE, flowchartNodeShape, flowchartEdgeConnector, edgeAnchors } from './freeFloating.js'

// Default box of a fresh (empty-text) mind-map node — matches mindmapLayout's
// MIN_W and one-line height, so it looks right before an explicit Tidy re-flow.
const NEW_W = 140
const NEW_H = 40
const GAP_X = 60
const GAP_Y = 16

function mindmapShape(shapes, id) {
  return (shapes || []).find((shape) => shape.id === id && shape.role === ROLE.mindmapNode)
}

// Children of a node in the reconstructed model, optionally on one side (root
// branches are placed per-side so the two sides stay balanced).
function childrenOf(model, parentId, side = null) {
  return model.nodes.filter((n) => n.parentId === parentId && (side === null || n.side === side))
}

// Which side a new child of `parentNode` goes on: an explicit choice wins; a root
// balances (fewer children wins, ties go right); deeper nodes inherit the parent's
// side so a branch keeps growing the same direction.
function resolveSide(model, parentNode, explicit) {
  if (explicit) return explicit
  if (parentNode.parentId) return parentNode.side || 'right'
  const right = childrenOf(model, parentNode.id, 'right').length
  const left = childrenOf(model, parentNode.id, 'left').length
  return left < right ? 'left' : 'right'
}

// Position a new child next to its parent on the chosen side, stacked below any
// existing children on that side. Deliberately local (no full re-layout) — Tidy-up
// re-flows the whole tree as an explicit action later.
function childBox(parentShape, side, indexOnSide) {
  const x = side === 'left' ? parentShape.x - NEW_W - GAP_X : parentShape.x + parentShape.w + GAP_X
  const y = parentShape.y + parentShape.h / 2 - NEW_H / 2 + indexOnSide * (NEW_H + GAP_Y)
  return { x: Math.round(x), y: Math.round(y), w: NEW_W, h: NEW_H }
}

// Build the tagged shape + branch connector for a new child of `parentShapeId`.
// Returns null when the parent is not a mind-map shape. The caller assigns zIndex
// and commits both objects as one undoable unit.
export function buildMindmapChild(shapes, parentShapeId, themePreset, explicitSide = null) {
  const parentShape = mindmapShape(shapes, parentShapeId)
  if (!parentShape) return null
  const model = mindmapModelFromShapes(shapes)
  const parentNode = model.nodes.find((n) => n.id === parentShapeId)
  if (!parentNode) return null

  const side = resolveSide(model, parentNode, explicitSide)
  const order = childrenOf(model, parentShapeId).length
  const indexOnSide = childrenOf(model, parentShapeId, side).length
  const depth = (parentNode.depth ?? 0) + 1

  const id = nextId('n')
  // Add the node to the model view so resolveNodeColor sees its place in the tree
  // (branch hue derives from the first-level ancestor's index + depth lightening).
  const newNode = {
    id, parentId: parentShapeId, text: '', order, depth,
    side: parentNode.parentId ? parentNode.side : side, color: null,
    marker: { icon: null, colorDot: null },
  }
  model.nodes.push(newNode)
  const color = resolveNodeColor(model, newNode, themePreset)
  const fill = nodeFill(color)
  const box = childBox(parentShape, side, indexOnSide)

  const shape = createShape(
    {
      id, type: 'rounded', ...box, rotation: 0, opacity: 1,
      fill, border: { color, width: 1.5, dash: 'solid' },
      text: { content: '', align: 'center', valign: 'middle', style: { size: 16, bold: false, italic: false, underline: false, color: readableInk(fill) } },
      role: ROLE.mindmapNode,
      mindmap: { parentId: parentShapeId, order, depth, collapsed: false, side: newNode.side, color: null, marker: { icon: null, colorDot: null }, isRoot: false, shaped: false },
    },
    themePreset,
  )
  const connector = createConnector({
    id: `mmb-${parentShapeId}-${id}`, type: 'curved',
    from: { shapeId: parentShapeId, anchor: side === 'left' ? 'left' : 'right' },
    to: { shapeId: id, anchor: side === 'left' ? 'right' : 'left' },
    arrowheads: { start: 'none', end: 'none' },
    style: { color, width: 2, dash: 'solid' }, label: '',
    role: ROLE.mindmapBranch, mindmap: { parentId: parentShapeId, childId: id },
  })
  return { shape, connector }
}

// A sibling of `nodeShapeId` is a child of its parent (same side). For a root
// (no parent) there are no siblings, so grow it with a child instead — matching
// the framed model's Enter-on-root behaviour.
export function buildMindmapSibling(shapes, nodeShapeId, themePreset) {
  const model = mindmapModelFromShapes(shapes)
  const node = model.nodes.find((n) => n.id === nodeShapeId)
  if (!node) return null
  if (!node.parentId) return buildMindmapChild(shapes, nodeShapeId, themePreset)
  return buildMindmapChild(shapes, node.parentId, themePreset, node.side)
}

// --- flowchart --------------------------------------------------------------

// Build the tagged shape + edge connector for a new flowchart node connected one
// level down from `parentShapeId`. Reconstructs the flowchart model from the tagged
// shapes/connectors so the existing pure placement (placeChild, decision branch
// fan-out) runs, then returns a shape + connector identical to a migrated one.
// Returns null when the parent is not a flowchart shape. The caller assigns zIndex
// and commits both objects as one undoable unit.
export function buildFlowchartChild(shapes, connectors, parentShapeId, nodeType) {
  const parentShape = (shapes || []).find((s) => s.id === parentShapeId && s.role === ROLE.flowchartNode)
  if (!parentShape) return null
  const model = flowchartModelFromShapes(shapes, connectors)
  const parentNode = model.nodes.find((n) => n.id === parentShapeId)
  if (!parentNode) return null

  const draft = makeFlowchartNode(nodeType, defaultNodeText(nodeType), 0, 0)
  // Extend a decision node through a free branch port (Yes/No/…), carrying its label
  // onto the edge and fanning the child into that branch's lane — so the new edge
  // isn't an unlabelled centre 'out' (matches the sub-model + "+"-handle paths).
  const branch = pickFreeBranch(parentNode, model)
  const branchCount = parentNode.nodeType === 'decision' ? parentNode.branches.length : 1
  const branchIndex = branch ? parentNode.branches.findIndex((b) => b.port === branch.port) : null
  const size = nodeSize(draft)
  const pos = placeChild(model, parentShapeId, { ...draft, ...size }, branchIndex, branchCount)
  const childBox = { x: pos.x, y: pos.y, w: size.w, h: size.h }

  const shape = flowchartNodeShape(draft, childBox)
  const parentBox = { x: parentShape.x, y: parentShape.y, w: parentShape.w, h: parentShape.h }
  const anchors = edgeAnchors(parentBox, childBox)
  const connector = flowchartEdgeConnector(`fce-${parentShapeId}-${draft.id}`, parentShapeId, draft.id, anchors, {
    fromPort: branch ? branch.port : 'out',
    toPort: 'in',
    kind: 'flow',
    label: branch ? branch.label : '',
  })
  return { shape, connector }
}

// --- flowchart whole-graph layout (#98) -------------------------------------

// The persisted flow direction of the free-floating flowchart. It lives on the node
// shapes' tag (a flip writes the same value to all of them), defaulting to
// top-to-bottom for a fresh migrated chart that has never been flipped.
export function flowchartDirectionOfShapes(shapes) {
  const tagged = (shapes || []).find((s) => s.role === ROLE.flowchartNode && s.flowchart?.direction)
  return tagged?.flowchart.direction || 'TB'
}

// Run a whole-graph layout action (Tidy up / flip direction / number steps) over the
// free-floating flowchart shapes, the way BottomPalette's standalone actions run it
// over state.flowchart. Reconstructs the pure model so the existing, tested layout
// logic runs unchanged, seeds the persisted direction + step-number state, applies
// `action(model)`, then returns the shape/connector PATCHES to write back — never
// mutating the inputs. The store applies the patches inside one commit().
//   - node patches: new x/y, text (numbering), and the manuallyPositioned /
//     direction / stepPrefix tags.
//   - edge patches: recomputed anchors, so arrows leave the right side after a flip.
// `rootId` is the selected node: the action is scoped to that node's connected
// component so a second, independent flowchart on the same canvas is left untouched
// (#167). A null rootId re-flows every flowchart node (legacy whole-canvas behaviour).
export function flowchartLayoutPatches(shapes, connectors, action, rootId = null) {
  const allNodeShapes = (shapes || []).filter((s) => s.role === ROLE.flowchartNode)
  if (!allNodeShapes.length) return { nodes: [], edges: [] }
  const memberIds = rootId
    ? flowchartComponentIds(shapes, connectors, rootId)
    : new Set(allNodeShapes.map((s) => s.id))
  if (!memberIds.size) return { nodes: [], edges: [] }

  // Reconstruct from ONLY the selected chart's nodes + the edges among them, so both
  // the layout and the returned patches stay confined to that component.
  const nodeShapes = allNodeShapes.filter((s) => memberIds.has(s.id))
  const edgeConnectors = (connectors || []).filter(
    (c) => c.role === ROLE.flowchartEdge && memberIds.has(c.from?.shapeId) && memberIds.has(c.to?.shapeId),
  )
  const direction = flowchartDirectionOfShapes(nodeShapes)
  const model = flowchartModelFromShapes(nodeShapes, edgeConnectors, direction)
  seedStepNumbers(model, nodeShapes)
  action(model)

  const boxes = {}
  const nodes = model.nodes.map((node) => {
    boxes[node.id] = { x: node.x, y: node.y, w: node.w, h: node.h }
    return {
      id: node.id,
      x: node.x,
      y: node.y,
      text: node.text || '',
      manuallyPositioned: !!node.manuallyPositioned,
      direction: model.direction || 'TB',
      stepPrefix: node._stepPrefix || null,
    }
  })
  const edges = edgeConnectors
    .map((c) => {
      const from = boxes[c.from?.shapeId]
      const to = boxes[c.to?.shapeId]
      if (!from || !to) return null
      const anchors = edgeAnchors(from, to)
      return { id: c.id, fromAnchor: anchors.from, toAnchor: anchors.to }
    })
    .filter(Boolean)
  return { nodes, edges }
}

// Seed the reconstructed model with the persisted step-number state so autoNumberFlow
// toggles correctly across calls (the model itself is rebuilt each time): the flow is
// "numbered" when any node carries a stored prefix, and each node's _stepPrefix is
// restored so toggling OFF strips exactly the prefix that was added.
function seedStepNumbers(model, nodeShapes) {
  const prefixById = {}
  for (const shape of nodeShapes) {
    if (shape.flowchart?.stepPrefix) prefixById[shape.id] = shape.flowchart.stepPrefix
  }
  model.numbered = Object.keys(prefixById).length > 0
  for (const node of model.nodes) {
    if (prefixById[node.id]) node._stepPrefix = prefixById[node.id]
  }
}
