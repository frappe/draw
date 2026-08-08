// Structure operations over the free-floating (free-floating #122) mind-map /
// flowchart shapes. These build the tagged shape (+ connector) for a new node,
// reusing the reconstruct-adapter for tree structure and the existing colour logic
// so a node added on the flattened canvas is indistinguishable from a migrated one.
// Pure builders (no store, no history) so they are unit-testable; the store wraps
// the returned objects in one commit().

import { createShape, createConnector, nextId } from './factories.js'
import { mindmapModelFromShapes, flowchartModelFromShapes, flowchartComponentIds, mindmapComponentIds } from './freeFloatingGraph.js'
import { subtreeIds } from './mindmapModel.js'
import { layoutMindMap } from './mindmapLayout.js'
import { DEFAULT_NODE_STYLE, nodeColors, borderProp, connectorColor } from './mindmapNodeStyle.js'
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

// Which shapes a drag on a mind-map node should move (#273). Returns null when the
// shape isn't a mind-map node (normal free drag); an EMPTY array for a CHILD, which
// is auto-laid-out and so not freely draggable (the press selects it but nothing
// moves); or the whole tree's shape ids for a ROOT, since dragging the root moves
// the entire map as a unit (its attached branch connectors follow their endpoints).
export function mindmapDragTargets(shapes, shapeId) {
  const shape = mindmapShape(shapes, shapeId)
  if (!shape) return null
  if (shape.mindmap?.parentId) return []
  return subtreeIds(mindmapModelFromShapes(shapes), shapeId)
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
// and commits both objects as one undoable unit. `style` is the user's Child-node
// default look (#260) — monochrome gray box by default; the branch line follows
// the child's border colour (#272).
export function buildMindmapChild(shapes, parentShapeId, themePreset, explicitSide = null, style = DEFAULT_NODE_STYLE) {
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
  const colors = nodeColors(style)
  const box = childBox(parentShape, side, indexOnSide)

  const shape = createShape(
    {
      id, type: 'rounded', ...box, rotation: 0, opacity: 1,
      fill: colors.fill, border: borderProp(colors.border, 1.5),
      text: { content: '', align: style.align, valign: 'middle', style: { size: 16, bold: false, italic: false, underline: false, color: colors.ink } },
      role: ROLE.mindmapNode,
      mindmap: { parentId: parentShapeId, order, depth, collapsed: false, side: newNode.side, color: null, curve: style.curve, marker: { icon: null, colorDot: null }, isRoot: false, shaped: colors.shaped },
    },
    themePreset,
  )
  const connector = createConnector({
    id: `mmb-${parentShapeId}-${id}`, type: 'curved',
    from: { shapeId: parentShapeId, anchor: side === 'left' ? 'left' : 'right' },
    to: { shapeId: id, anchor: side === 'left' ? 'right' : 'left' },
    arrowheads: { start: 'none', end: 'none' },
    style: { color: connectorColor(), width: 2, dash: 'solid' }, label: '',
    role: ROLE.mindmapBranch, mindmap: { parentId: parentShapeId, childId: id },
  })
  return { shape, connector }
}

// A sibling of `nodeShapeId` is a child of its parent (same side). For a root
// (no parent) there are no siblings, so grow it with a child instead — matching
// the framed model's Enter-on-root behaviour. `style` carries the user's Child-node
// default look through to the new node (#260), same as buildMindmapChild.
export function buildMindmapSibling(shapes, nodeShapeId, themePreset, style = DEFAULT_NODE_STYLE) {
  const model = mindmapModelFromShapes(shapes)
  const node = model.nodes.find((n) => n.id === nodeShapeId)
  if (!node) return null
  if (!node.parentId) return buildMindmapChild(shapes, nodeShapeId, themePreset, null, style)
  return buildMindmapChild(shapes, node.parentId, themePreset, node.side, style)
}

// --- mind-map whole-tree layout (#122 P3) -----------------------------------

// The mind-map counterpart of flowchartLayoutPatches: re-flow one free-floating mind
// map with the balanced auto-layout, as an explicit "Tidy up" action. A standalone
// mind-map doc lays out live through MindMapOverlay, but free-floating nodes are
// manually-draggable shapes, so a branch dragged askew stays askew until the user asks
// for a tidy. `rootId` is the selected node; the action is scoped to that node's whole
// tree (mindmapComponentIds) so a second, independent map on the same canvas is left
// untouched (#48). Reconstructs the pure model, runs the tested layoutMindMap, then
// PINS THE TREE BY ITS ROOT — the root's top-left stays exactly where it is, so the
// branches re-flow around it instead of the whole tree teleporting to the map's own
// origin. Returns the shape/connector PATCHES to write back, never mutating the inputs;
// the store applies them inside one commit().
//   - node patches: the new x/y of each laid-out node (a collapsed descendant has no
//     laid-out box, so it is left where it is).
//   - edge patches: branch anchors recomputed from the new boxes, so each curve leaves
//     the side its child now sits on.
export function mindmapLayoutPatches(shapes, connectors, rootId) {
  const memberIds = mindmapComponentIds(shapes, rootId)
  if (!memberIds.size) return { nodes: [], edges: [] }

  const nodeShapes = (shapes || []).filter((s) => s.role === ROLE.mindmapNode && memberIds.has(s.id))
  const model = mindmapModelFromShapes(nodeShapes)
  if (!model.rootId) return { nodes: [], edges: [] }
  const { positions } = layoutMindMap(model)

  // Pin the tree by its root: keep the root's top-left where the user has it, so Tidy
  // re-flows the branches around the root rather than teleporting the tree to origin.
  const rootPos = positions[model.rootId]
  const rootShape = nodeShapes.find((s) => s.id === model.rootId)
  if (!rootPos || !rootShape) return { nodes: [], edges: [] }
  const dx = rootShape.x - rootPos.x
  const dy = rootShape.y - rootPos.y

  const boxes = {}
  const nodes = []
  for (const shape of nodeShapes) {
    const p = positions[shape.id]
    if (!p) continue // collapsed descendant — no laid-out box, leave it put
    const x = Math.round(p.x + dx)
    const y = Math.round(p.y + dy)
    boxes[shape.id] = { x, y, w: p.w, h: p.h }
    nodes.push({ id: shape.id, x, y })
  }

  const edges = (connectors || [])
    .filter((c) => c.role === ROLE.mindmapBranch && boxes[c.from?.shapeId] && boxes[c.to?.shapeId])
    .map((c) => {
      const parentBox = boxes[c.from.shapeId]
      const childBox = boxes[c.to.shapeId]
      const childRight = childBox.x >= parentBox.x
      return { id: c.id, fromAnchor: childRight ? 'right' : 'left', toAnchor: childRight ? 'left' : 'right' }
    })
  return { nodes, edges }
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
