// Mind-map editor UI state (chrome, NOT the document). A single reactive
// singleton shared by the node layer, keyboard handler and right palette so they
// agree on which node is selected/editing, whether focus mode is on, and what
// is mid-flight (cross-link, delete confirm). Selection of node ids itself
// reuses the shared store.state.selection; this holds only mind-map UI.

import { reactive } from 'vue'

export const mindmapUi = reactive({
  editingId: null, // node currently in text-edit mode (or null)
  focusId: null, // focus mode: only this node's branch is shown (or null)
  pendingLinkSource: null, // first endpoint while creating a cross-link (or null)
  confirmDelete: null, // { ids: string[], label } awaiting an in-product confirm, or null
  // A cross-link is not a node, so it can't live in store.state.selection (which
  // holds node ids). It gets its own single-selection slot so Delete can target it.
  selectedCrosslinkId: null,
})

// The single selected node id (mind map selects one node at a time for keyboard
// navigation), read from the shared store selection.
export function selectedNodeId(store) {
  const ids = store.state.selection
  return ids.length === 1 ? ids[0] : null
}

export function selectNode(store, id) {
  store.select(id ? [id] : [])
  // Node and cross-link selection are mutually exclusive — otherwise Delete would
  // have two plausible targets.
  mindmapUi.selectedCrosslinkId = null
}

export function selectCrosslink(id) {
  mindmapUi.selectedCrosslinkId = id
}

export function beginEdit(id) {
  mindmapUi.editingId = id
}

export function endEdit() {
  mindmapUi.editingId = null
}

export function isEditing() {
  return mindmapUi.editingId !== null
}

// Focus mode: show only the selected node's branch (MindMapNodeLayer dims
// everything outside that subtree). Toggling off always wins, so the button is
// never a one-way trap even with nothing selected.
export function toggleFocus(store) {
  mindmapUi.focusId = mindmapUi.focusId ? null : selectedNodeId(store)
}

// The focused node id, but ONLY while that node still exists in `model`.
//
// focusId can outlive the node it names — delete the focused node, undo past its
// creation, switch documents, or receive a collaborator's delete. subtreeIds()
// returns [id] for an unknown id, so a stale focusId would leave a "focused
// subtree" containing nothing real and dim EVERY remaining node. Reading focus
// through this guard makes a stale id inert instead: no dimming, no banner.
//
// Deliberately pure — it does not clear focusId, because it is called from
// computeds and mutating reactive state during evaluation invites feedback loops.
// Turning focus off explicitly stays the job of toggleFocus.
export function focusedNodeId(model) {
  const id = mindmapUi.focusId
  if (!id) return null
  return model?.nodes?.some((node) => node.id === id) ? id : null
}
