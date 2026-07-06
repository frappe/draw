// Pure arrow-key navigation for mind maps (spec A5: up/down move among siblings,
// left/right move to parent/child). Returns the id to select next, or null when
// there is nowhere to go. Layout-independent: navigation follows the tree, not
// pixel positions, which keeps it deterministic and unit-testable.

import { childrenOf, parentOf, nodeById, isRoot } from './mindmapModel.js'

// Direction is one of 'up' | 'down' | 'left' | 'right'. Left/right respect the
// balanced two-sided layout: for a left-side node, "left" goes to its children
// and "right" goes to its parent (mirrored), so arrows always feel spatial.
export function navigate(model, currentId, direction) {
  const node = nodeById(model, currentId)
  if (!node) return model.rootId
  if (direction === 'up') return sibling(model, node, -1)
  if (direction === 'down') return sibling(model, node, 1)
  const onLeftSide = isOnLeftSide(model, node)
  const towardChildren = onLeftSide ? direction === 'left' : direction === 'right'
  return towardChildren ? firstVisibleChild(model, node) : parentTarget(model, node)
}

// The next visible sibling in `step` direction (-1 up, +1 down), or null.
function sibling(model, node, step) {
  if (isRoot(model, node.id)) return null
  const siblings = childrenOf(model, node.parentId)
  const index = siblings.findIndex((candidate) => candidate.id === node.id)
  const target = siblings[index + step]
  return target ? target.id : null
}

// First child to descend into, unless the node is collapsed (then stay put).
function firstVisibleChild(model, node) {
  if (node.collapsed) return null
  const children = childrenOf(model, node.id)
  return children.length ? children[0].id : null
}

// Going toward the parent; the root has none.
function parentTarget(model, node) {
  const parent = parentOf(model, node.id)
  return parent ? parent.id : null
}

// Which side of the balanced layout a node sits on: walk to its first-level
// branch, then read the side the layout actually assigns it. This must match
// mindmapLayout's placeRoot exactly — an explicit branch.side wins, and only the
// remaining (auto) branches alternate right/left — otherwise arrow keys disagree
// with the on-screen position. The root (and its absence) defaults to the right.
function isOnLeftSide(model, node) {
  let current = node
  while (current && current.parentId && current.parentId !== model.rootId) {
    current = parentOf(model, current.id)
  }
  if (!current || isRoot(model, current.id)) return false
  return branchSide(model, current.id) === 'left'
}

// The side placeRoot assigns a first-level branch: explicit side honoured, the
// rest alternate right/left by their order among the auto branches only.
function branchSide(model, branchId) {
  let autoIndex = 0
  for (const branch of childrenOf(model, model.rootId)) {
    let side
    if (branch.side === 'right' || branch.side === 'left') side = branch.side
    else side = autoIndex++ % 2 === 0 ? 'right' : 'left'
    if (branch.id === branchId) return side
  }
  return 'right'
}
