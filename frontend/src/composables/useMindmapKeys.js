// Per-mode keyboard handler for mind maps (spec A5, Part G5). Registered into the
// shared keyboard seam via registerModeKeyboardHandler('mindmap', …) at import
// time, so useKeyboard never needs editing. The shared dispatcher only calls this
// when NO text field is focused and no Cmd/Ctrl shortcut matched, which already
// satisfies the "guard while editing" rule for these keys. In-text-edit keys
// (Tab/Enter/Esc/Shift+Enter) are handled on the editable node element itself
// (MindMapNodeLayer), because the dispatcher skips events from editable targets.

import { registerModeKeyboardHandler } from '@/composables/useKeyboard.js'
import { navigate } from '@/diagram/mindmapNavigation.js'
import { isRoot } from '@/diagram/mindmapModel.js'
import { deleteNode, promoteNode, reorderNode } from '@/diagram/mindmapOperations.js'
import { selectedNodeId, selectNode, beginEdit, mindmapUi } from '@/stores/mindmapUi.js'

const ARROW_DIRECTIONS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
}

// Returns true when it consumed the key (the dispatcher then preventDefaults).
export function mindmapKeydown(event, store) {
  const model = store.state.mindmap
  if (!model || mindmapUi.editingId !== null) return false
  const id = selectedNodeId(store)
  if (event.key === 'Tab') return handleTab(store, id, event)
  if (event.key === 'Enter') return addSiblingAndEdit(store, id)
  if (ARROW_DIRECTIONS[event.key]) return handleArrow(store, model, id, event)
  if (event.key === 'Delete' || event.key === 'Backspace') return requestDelete(store, id)
  return false
}

// Tab adds a child (Shift+Tab promotes the selected node), both then editing.
function handleTab(store, id, event) {
  if (!id) return false
  if (event.shiftKey) return promoteSelected(store, id)
  const childId = store.addChildNode(id)
  return enterEdit(store, childId)
}

function promoteSelected(store, id) {
  if (promoteNode(store, id)) return true
  return true // consume Shift+Tab even when promotion is a no-op (don't tab away)
}

function addSiblingAndEdit(store, id) {
  if (!id || isRoot(store.state.mindmap, id)) {
    // Enter on the root (or nothing selected) adds a first branch instead.
    const target = id || store.state.mindmap.rootId
    return enterEdit(store, store.addChildNode(target))
  }
  return enterEdit(store, store.addSiblingNode(id))
}

// Arrows navigate selection (Alt+Up/Down reorders among siblings instead).
function handleArrow(store, model, id, event) {
  if (!id) {
    selectNode(store, model.rootId)
    return true
  }
  if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    return reorderNode(store, id, event.key === 'ArrowUp' ? -1 : 1) || true
  }
  const nextId = navigate(model, id, ARROW_DIRECTIONS[event.key])
  if (nextId) selectNode(store, nextId)
  return true
}

// Delete/Backspace deletes the node; a node with children is confirmed first and
// removed as a subtree. The root is never deleted (offer Clear map in palette).
function requestDelete(store, id) {
  if (!id || isRoot(store.state.mindmap, id)) return Boolean(id)
  const node = store.state.mindmap.nodes.find((candidate) => candidate.id === id)
  const hasChildren = store.state.mindmap.nodes.some((candidate) => candidate.parentId === id)
  if (hasChildren && !window.confirm(`Delete "${node?.text || 'this node'}" and its sub-branches?`)) {
    return true
  }
  selectNode(store, node?.parentId || null)
  deleteNode(store, id)
  return true
}

// Select a freshly created node and put it straight into text-edit (A5: new
// nodes enter edit mode). Null id (non-mindmap / refused) is a harmless no-op.
function enterEdit(store, id) {
  if (!id) return true
  selectNode(store, id)
  beginEdit(id)
  return true
}

registerModeKeyboardHandler('mindmap', mindmapKeydown)
