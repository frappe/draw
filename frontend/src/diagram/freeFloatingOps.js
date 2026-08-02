// Structure operations over the free-floating (free-floating #122) mind-map /
// flowchart shapes. These build the tagged shape (+ connector) for a new node,
// reusing the reconstruct-adapter for tree structure and the existing colour logic
// so a node added on the flattened canvas is indistinguishable from a migrated one.
// Pure builders (no store, no history) so they are unit-testable; the store wraps
// the returned objects in one commit().

import { createShape, createConnector, nextId } from './factories.js'
import { mindmapModelFromShapes } from './freeFloatingGraph.js'
import { resolveNodeColor, nodeFill, readableInk } from './mindmapColors.js'
import { ROLE } from './freeFloating.js'

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
      mindmap: { parentId: parentShapeId, order, depth, collapsed: false, side: newNode.side, color: null, marker: { icon: null, colorDot: null }, isRoot: false },
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
