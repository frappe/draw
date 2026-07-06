// Mind-map semantic operations layered on the shared store WITHOUT editing it
// (strict file ownership). Each wraps a pure model mutation in store.commit() so
// it is ONE undoable unit (Part G6); layout is derived, never in history. The
// store already exposes addChildNode/addSiblingNode/updateNode; everything else
// (delete-subtree, promote, reorder, reparent, collapse, paste, crosslinks,
// recolor) is composed here via store.commit + the pure mindmapModel helpers.

import {
  deleteSubtree,
  promote,
  reparent,
  reorderSibling,
  toggleCollapsed,
  setAllCollapsed,
  addCrosslink,
  removeCrosslink,
  childrenOf,
} from './mindmapModel.js'
import { parseIndentedText, buildSubtree } from './mindmapPaste.js'

// Run a mutation against the live mindmap model as one undoable commit. No-op
// when the active diagram is not a mind map (defensive, mirrors store helpers).
function commitMindmap(store, label, mutatorFn) {
  const model = store.state.mindmap
  if (!model) return null
  let result = null
  store.commit(label, () => (result = mutatorFn(model)))
  return result
}

export function deleteNode(store, id) {
  return commitMindmap(store, 'Delete node', (model) => deleteSubtree(model, id))
}

// Delete several nodes (+ their subtrees) as ONE undoable unit — for a
// multi-selection Delete. The caller filters out the root; deleting an ancestor
// first makes a later descendant delete a harmless no-op.
export function deleteNodes(store, ids) {
  if (!ids?.length) return
  commitMindmap(store, 'Delete nodes', (model) => {
    for (const id of ids) deleteSubtree(model, id)
  })
}

// Clear the whole map (used when the root itself is deleted) — resets to the
// empty state so the "Add your first idea" prompt returns. One undoable unit.
export function clearMindmap(store) {
  commitMindmap(store, 'Delete mind map', (model) => {
    model.nodes = []
    model.rootId = null
    model.crosslinks = []
  })
}

export function promoteNode(store, id) {
  return commitMindmap(store, 'Promote node', (model) => promote(model, id))
}

export function reparentNode(store, id, newParentId) {
  return commitMindmap(store, 'Move node', (model) => reparent(model, id, newParentId))
}

export function reorderNode(store, id, direction) {
  return commitMindmap(store, 'Reorder node', (model) => reorderSibling(model, id, direction))
}

export function toggleNodeCollapsed(store, id) {
  return commitMindmap(store, 'Collapse node', (model) => toggleCollapsed(model, id))
}

export function collapseAll(store, collapsed) {
  const label = collapsed ? 'Collapse all' : 'Expand all'
  return commitMindmap(store, label, (model) => setAllCollapsed(model, collapsed))
}

export function linkNodes(store, fromId, toId, label = '') {
  return commitMindmap(store, 'Add cross-link', (model) => addCrosslink(model, fromId, toId, label))
}

export function unlinkNodes(store, id) {
  return commitMindmap(store, 'Remove cross-link', (model) => removeCrosslink(model, id))
}

// Paste an indented/bulleted outline under a node as one undoable subtree build.
export function pasteOutline(store, parentId, rawText) {
  const items = parseIndentedText(rawText)
  if (!items.length) return []
  return commitMindmap(store, 'Paste outline', (model) => buildSubtree(model, parentId, items))
}

// Clear every node's manual color override so theme/branch colors take over again
// (spec A9 "theme presets reassign"). One undoable unit.
export function reassignBranchColors(store) {
  return commitMindmap(store, 'Recolor branches', (model) => {
    for (const node of model.nodes) node.color = null
  })
}
