// Mind-map tree model — pure data + mutations (spec diagram-types Part A11).
// A mind map is one root plus nodes each having one parent (parentId) and an
// `order` among siblings. IDs are stable (factories nextId), never array index
// (Part G2). Layout positions are derived elsewhere (mindmapLayout.js), never
// stored here. Mutations operate in place and return the new/affected id so the
// store can wrap them in commit() for undo (Part G6).

import { nextId } from './factories.js'

const ROOT_TEXT = ''

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
  }
}

export function createMindMap(rootText = ROOT_TEXT) {
  const root = makeNode(null, rootText, 0, 0)
  return { rootId: root.id, nodes: [root], crosslinks: [], layout: 'balanced' }
}

// A truly empty mind map — no root yet (spec: "blank" must show no defaults).
// The first idea is added via addRootNode from the canvas prompt.
export function createEmptyMindMap() {
  return { rootId: null, nodes: [], crosslinks: [], layout: 'balanced' }
}

// Create the root of an empty map (no-op if one already exists). Returns its id.
export function addRootNode(model, text = '') {
  if (model.rootId && nodeById(model, model.rootId)) return model.rootId
  const root = makeNode(null, text, 0, 0)
  model.nodes.push(root)
  model.rootId = root.id
  return root.id
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
// `side` ('left'|'right') pins a first-level branch to a side of the root so it's
// placed where the user clicked (the layout honours it); ignored for deeper nodes.
export function addChild(model, parentId, text = '', side = null) {
  const parent = nodeById(model, parentId)
  if (!parent) return null
  const siblings = childrenOf(model, parentId)
  const node = makeNode(parentId, text, siblings.length, parent.depth + 1)
  if (side && parentId === model.rootId) node.side = side
  model.nodes.push(node)
  return node.id
}

// Add a sibling after `nodeId`. The root has no siblings, so this is a no-op
// there (callers should add a child instead). Returns the new node id. A new
// first-level sibling inherits the source node's side so it lands next to it,
// not on the opposite side of the root.
export function addSibling(model, nodeId, text = '') {
  const node = nodeById(model, nodeId)
  if (!node || isRoot(model, nodeId)) return null
  const newId = addChild(model, node.parentId, text, node.side)
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

// The parent node of `id`, or null for the root / unknown ids.
export function parentOf(model, id) {
  const node = nodeById(model, id)
  return node && node.parentId ? nodeById(model, node.parentId) : null
}

// Ids of a node and every descendant (the whole subtree, pre-order).
export function subtreeIds(model, id) {
  const ids = [id]
  for (const child of childrenOf(model, id)) ids.push(...subtreeIds(model, child.id))
  return ids
}

// True when `targetId` is `nodeId` itself or one of its descendants. Used to
// block re-parenting a node into its own subtree (cycle prevention, A12).
export function isDescendant(model, nodeId, targetId) {
  return subtreeIds(model, nodeId).includes(targetId)
}

// Delete a node and its whole subtree. The root cannot be deleted (A12); callers
// offer "clear map" instead. Returns the deleted ids (empty when refused).
export function deleteSubtree(model, id) {
  if (isRoot(model, id)) return []
  const node = nodeById(model, id)
  if (!node) return []
  const ids = subtreeIds(model, id)
  const removed = new Set(ids)
  model.nodes = model.nodes.filter((candidate) => !removed.has(candidate.id))
  model.crosslinks = model.crosslinks.filter(
    (link) => !removed.has(link.fromId) && !removed.has(link.toId),
  )
  renumberChildren(model, node.parentId)
  return ids
}

// Promote (outdent): make `id` a sibling of its parent, placed right after it.
// No-op for the root and for direct children of the root (nowhere to go).
export function promote(model, id) {
  const node = nodeById(model, id)
  if (!node || isRoot(model, id)) return false
  const parent = nodeById(model, node.parentId)
  if (!parent || isRoot(model, parent.id)) return false
  const oldParentId = node.parentId
  reattach(model, node, parent.parentId, parent.order)
  renumberChildren(model, oldParentId)
  return true
}

// Re-parent `id` under `newParentId` (appended), blocking cycles (A12). Returns
// false when the move is illegal (unknown nodes, root, or self/descendant target).
export function reparent(model, id, newParentId) {
  const node = nodeById(model, id)
  const target = nodeById(model, newParentId)
  if (!node || !target || isRoot(model, id)) return false
  if (id === newParentId || isDescendant(model, id, newParentId)) return false
  const oldParentId = node.parentId
  const order = childrenOf(model, newParentId).length
  reattach(model, node, newParentId, order - 0.5)
  if (oldParentId !== newParentId) renumberChildren(model, oldParentId)
  return true
}

// Move `id` among its siblings by one step (-1 up, +1 down). Returns false at the
// ends. Implemented by nudging the order value and renumbering densely.
export function reorderSibling(model, id, direction) {
  const node = nodeById(model, id)
  if (!node || isRoot(model, id)) return false
  const siblings = childrenOf(model, node.parentId)
  const index = siblings.findIndex((sibling) => sibling.id === id)
  const target = index + direction
  if (target < 0 || target >= siblings.length) return false
  node.order += direction * 1.5
  renumberChildren(model, node.parentId)
  return true
}

// Reparent and renumber the subtree's depths in one place (shared by promote /
// reparent). `order` may be fractional; renumberChildren densifies afterwards.
function reattach(model, node, newParentId, order) {
  node.parentId = newParentId
  node.order = order
  renumberChildren(model, newParentId)
  refreshDepths(model)
}

// Recompute every node's depth from the root down (cheap, O(n)).
export function refreshDepths(model) {
  const setDepth = (id, depth) => {
    const node = nodeById(model, id)
    if (node) node.depth = depth
    for (const child of childrenOf(model, id)) setDepth(child.id, depth + 1)
  }
  setDepth(model.rootId, 0)
}

// Toggle a node's collapsed flag (collapsed subtrees occupy zero layout space).
export function toggleCollapsed(model, id) {
  const node = nodeById(model, id)
  if (node) node.collapsed = !node.collapsed
}

// Set the collapsed flag on every node that has children (collapse/expand all).
export function setAllCollapsed(model, collapsed) {
  for (const node of model.nodes) {
    if (childrenOf(model, node.id).length) node.collapsed = collapsed
  }
}

// Add a cross-link (non-tree dotted connector) between two distinct nodes.
// Refuses duplicates and self-links. Returns the new link id or null.
export function addCrosslink(model, fromId, toId, label = '') {
  if (fromId === toId || !nodeById(model, fromId) || !nodeById(model, toId)) return null
  const exists = model.crosslinks.some(
    (link) => link.fromId === fromId && link.toId === toId,
  )
  if (exists) return null
  const link = { id: nextId('x'), fromId, toId, label }
  model.crosslinks.push(link)
  return link.id
}

export function removeCrosslink(model, id) {
  model.crosslinks = model.crosslinks.filter((link) => link.id !== id)
}
