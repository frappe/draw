// Transient flowchart editing UI shared across the layer, the interaction
// composable and the blank-state overlay. Keeps `editingId` out of any single
// component so a node created from a "+" handle, a drag-to-empty, or the "add
// first step" prompt can all request inline editing immediately (no click).
import { reactive } from 'vue'

export const flowchartUi = reactive({
  editingId: null, // node whose text is being edited inline, or null
})

// Ask the layer to open the inline editor on a node (focus + select handled by
// the layer's watcher). Used right after a node is created so the user can type
// straight away.
export function requestFlowchartEdit(id) {
  flowchartUi.editingId = id
}

export function endFlowchartEdit(id) {
  if (!id || flowchartUi.editingId === id) flowchartUi.editingId = null
}

// Clear the transient editing state when a document loads or is swapped in place.
// editingId is a node id, and node ids are per-document counters that repeat
// across documents, so a leftover editingId would otherwise re-open the inline
// editor on whichever node happens to share that id in the new document. Mirrors
// resetMindmapUi; called from EditorShell at the same two points.
export function resetFlowchartUi() {
  flowchartUi.editingId = null
}
