// Per-mode keyboard handler for mind maps (spec A5, Part G5). Registered into the
// shared keyboard seam via registerModeKeyboardHandler('mindmap', …) at import
// time, so useKeyboard never needs editing. The shared dispatcher only calls this
// when NO text field is focused and no Cmd/Ctrl shortcut matched, which already
// satisfies the "guard while editing" rule for these keys. In-text-edit keys
// (Tab/Enter/Esc/Shift+Enter) are handled on the editable node element itself
// (MindMapNodeLayer), because the dispatcher skips events from editable targets.

import { registerModeKeyboardHandler } from '@/composables/useKeyboard.js'
import { navigate } from '@/diagram/mindmapNavigation.js'
import { isRoot, rootNodes } from '@/diagram/mindmapModel.js'
import { deleteNodes, promoteNode, reorderNode, unlinkNodes } from '@/diagram/mindmapOperations.js'
import { selectedNodeId, selectNode, beginEdit, mindmapUi } from '@/stores/mindmapUi.js'
import { isMindmapShape } from '@/diagram/freeFloating.js'
import { useTextEditing } from '@/composables/useTextEditing.js'

const ARROW_DIRECTIONS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
}

// Returns true when it consumed the key (the dispatcher then preventDefaults).
export function mindmapKeydown(event, store, editorUi) {
  const model = store.state.mindmap
  if (mindmapUi.editingId !== null) return false
  // Free-floating (#122): if the selection is migrated mind-map SHAPES, the growth
  // keys operate on shapes + connectors, not the (empty) sub-model below.
  const freeIds = (store.state.selection || []).filter((sid) =>
    isMindmapShape(store.state.shapes?.find((s) => s.id === sid)),
  )
  if (freeIds.length) return freeFloatingMindmapKey(event, store, editorUi, freeIds)
  if (!model) return false
  const id = selectedNodeId(store)
  if (event.key === 'Tab') return handleTab(store, id, event)
  if (event.key === 'Enter') return addSiblingAndEdit(store, id)
  if (ARROW_DIRECTIONS[event.key]) return handleArrow(store, model, id, event)
  if (event.key === 'Delete' || event.key === 'Backspace') {
    // A selected cross-link is the Delete target, but only while no node is also
    // selected — selecting a link clears the node selection, though an additive
    // click could still add one, and a node delete must win in that case.
    if (mindmapUi.selectedCrosslinkId && !(store.state.selection || []).length) {
      unlinkNodes(store, mindmapUi.selectedCrosslinkId)
      mindmapUi.selectedCrosslinkId = null
      return true
    }
    return requestDelete(store)
  }
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

// Delete/Backspace removes EVERY selected node (single or multi — N11) as one
// undoable unit; nodes with children are confirmed first and removed as subtrees.
// Deleting a root removes its whole tree, confirmed. Reads the shared selection
// array directly, since selectedNodeId() is null during a multi-select.
export function requestDelete(store) {
  const model = store.state.mindmap
  const selection = store.state.selection || []
  if (!selection.length) return false
  const roots = selection.filter((nid) => isRoot(model, nid))
  if (roots.length) {
    mindmapUi.confirmDelete = confirmForRoots(model, roots)
    return true
  }
  const ids = selection.filter((nid) => !isRoot(model, nid))
  if (!ids.length) return true
  const hasChildren = ids.some((nid) => model.nodes.some((n) => n.parentId === nid))
  const label = ids.length > 1
    ? `Delete ${ids.length} nodes and their sub-branches?`
    : `Delete "${model.nodes.find((n) => n.id === ids[0])?.text || 'this node'}" and its sub-branches?`
  // Nodes with children are confirmed via an in-product dialog (MindMapOverlay
  // renders it and performs the delete on confirm); leaves delete immediately.
  if (hasChildren) {
    mindmapUi.confirmDelete = { ids: [...ids], label }
    return true
  }
  // Land selection on the first node's parent (or clear) for a sensible next focus.
  const first = model.nodes.find((n) => n.id === ids[0])
  selectNode(store, first?.parentId || null)
  deleteNodes(store, ids)
  return true
}

// A map can hold several independent trees (#48): deleting the root of one drops
// just that mind map, while deleting the last one left clears the map back to
// blank (the state the "Add your first idea" prompt belongs to).
function confirmForRoots(model, roots) {
  if (rootNodes(model).length <= roots.length) {
    return { clearAll: true, label: 'Delete the entire mind map? This removes every node.' }
  }
  const label = roots.length > 1
    ? `Delete ${roots.length} mind maps? This removes every node in them.`
    : 'Delete this mind map? This removes every node in it.'
  return { trees: roots, label }
}

// Select a freshly created node and put it straight into text-edit (A5: new
// nodes enter edit mode). Null id (non-mindmap / refused) is a harmless no-op.
function enterEdit(store, id) {
  if (!id) return true
  selectNode(store, id)
  beginEdit(id)
  return true
}

// A migrated free-floating node (free-floating #122) is a block shape, so only the
// growth keys have a mind-map meaning here (Tab=child, Enter=sibling, Delete=remove
// the subtree). Other keys are consumed as a no-op: while a node owns the keyboard
// the block handler is suppressed anyway (useKeyboard line ~133), so arrow-nudging a
// node is not wanted.
function freeFloatingMindmapKey(event, store, editorUi, ids) {
  const id = ids.length === 1 ? ids[0] : null
  const name = (newId) => nameNewNode(store, editorUi, newId)
  if (event.key === 'Tab' && !event.shiftKey && id) return name(store.addChildNode(id))
  if (event.key === 'Enter' && id) return name(store.addSiblingNode(id))
  if (event.key === 'Delete' || event.key === 'Backspace') {
    store.deleteMindmapSubtrees(ids)
    selectNode(store, null)
    return true
  }
  return true
}

// A node the user just asked for is unnamed by definition, so the caret goes into it
// (#514) — the same treatment a dropped starter and a "+" click already get. A
// migrated node uses the shared block text editor rather than the sub-model's inline
// one, which is why this is beginTextEdit and not beginEdit. selectNode still runs
// first: beginTextEdit selects the shape, but only selectNode drops a selected
// cross-link, and leaving one behind would give Delete two plausible targets.
function nameNewNode(store, editorUi, id) {
  if (!id) return true
  selectNode(store, id)
  useTextEditing(store, editorUi).beginTextEdit(id, { selectAll: true })
  return true
}

registerModeKeyboardHandler('mindmap', mindmapKeydown)
