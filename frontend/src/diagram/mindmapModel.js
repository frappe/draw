// Mind-map tree model — pure data + mutations (spec diagram-types Part A11).
// A mind map is one root plus nodes each having one parent (parentId) and an
// `order` among siblings. IDs are stable (factories nextId), never array index
// (Part G2). Layout positions are derived elsewhere (mindmapLayout.js), never
// stored here. Mutations operate in place and return the new/affected id so the
// store can wrap them in commit() for undo (Part G6).

import { nextId } from './factories.js'

const ROOT_TEXT = 'Central idea'

function makeNode(parentId, text, order, depth) {
  return {
    id: nextId('n'),
    parentId,
    text,
    order,
    depth,
    collapsed: false,
    color: null,
    marker: { icon: null, colorDot: null },
    note: '',
  }
}

export function createMindMap(rootText = ROOT_TEXT) {
  const root = makeNode(null, rootText, 0, 0)
  return { rootId: root.id, nodes: [root], crosslinks: [], layout: 'balanced' }
}

export function nodeById(model, id) {
  return model.nodes.find((node) => node.id === id)
}

// Children of a node, sorted by their sibling order.
export function childrenOf(model, parentId) {
  return model.nodes
    .filter((node) => node.parentId === parentId)
    .sort((a, b) => a.order - b.order)
}

export function isRoot(model, id) {
  return model.rootId === id
}

// Add a child under `parentId`, appended after existing children. Returns its id.
export function addChild(model, parentId, text = '') {
  const parent = nodeById(model, parentId)
  if (!parent) return null
  const siblings = childrenOf(model, parentId)
  const node = makeNode(parentId, text, siblings.length, parent.depth + 1)
  model.nodes.push(node)
  return node.id
}

// Add a sibling after `nodeId`. The root has no siblings, so this is a no-op
// there (callers should add a child instead). Returns the new node id.
export function addSibling(model, nodeId, text = '') {
  const node = nodeById(model, nodeId)
  if (!node || isRoot(model, nodeId)) return null
  const newId = addChild(model, node.parentId, text)
  reorderAfter(model, node.parentId, newId, node.order)
  return newId
}

// Place `movedId` immediately after sibling `afterOrder`, renumbering the group.
function reorderAfter(model, parentId, movedId, afterOrder) {
  const moved = nodeById(model, movedId)
  moved.order = afterOrder + 0.5
  renumberChildren(model, parentId)
}

// Normalise a sibling group's order values to a dense 0..n-1 sequence.
export function renumberChildren(model, parentId) {
  childrenOf(model, parentId).forEach((node, index) => {
    node.order = index
  })
}

// Count of all descendants of a node (used for collapse badges later).
export function descendantCount(model, id) {
  return childrenOf(model, id).reduce(
    (total, child) => total + 1 + descendantCount(model, child.id),
    0,
  )
}
