// Mind-map editor UI state (chrome, NOT the document). A single reactive
// singleton shared by the node layer, keyboard handler, right palette and
// outline panel so they agree on which node is selected/editing and whether
// focus mode / the outline / the notes panel are open. Selection of node ids
// itself reuses the shared store.state.selection; this holds only mind-map UI.

import { reactive } from 'vue'

export const mindmapUi = reactive({
  editingId: null, // node currently in text-edit mode (or null)
  focusId: null, // focus mode: only this node's branch is shown (or null)
  outlineVisible: false, // outline side panel open
  notesNodeId: null, // node whose note is shown in the side panel (or null)
  pendingLinkSource: null, // first endpoint while creating a cross-link (or null)
})

// The single selected node id (mind map selects one node at a time for keyboard
// navigation), read from the shared store selection.
export function selectedNodeId(store) {
  const ids = store.state.selection
  return ids.length === 1 ? ids[0] : null
}

export function selectNode(store, id) {
  store.select(id ? [id] : [])
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

export function toggleOutline() {
  mindmapUi.outlineVisible = !mindmapUi.outlineVisible
}

export function toggleFocus(store) {
  mindmapUi.focusId = mindmapUi.focusId ? null : selectedNodeId(store)
}
