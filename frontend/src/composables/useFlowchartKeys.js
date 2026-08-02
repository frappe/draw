// Per-mode keyboard handler for flowchart (spec diagram-types B5, Part G5).
// With a node selected and NOT editing text: Enter->Process, D->Decision,
// T->Terminator, I->Input/Output each create a node one level down, auto-connect
// with an arrowed elbow and auto-position (Mermaid-speed flow building). Delete /
// Backspace removes the selected node and its touching edges (no dangling, B11).
// Returns true when it consumed the event so the global dispatcher calls
// preventDefault; useKeyboard only invokes this when no text field is focused.

import {
  flowchartNodeById,
  makeFlowchartNode,
  makeFlowchartEdge,
  defaultNodeText,
  nodeSize,
  pickFreeBranch,
} from '@/diagram/flowchartModel.js'
import { placeChild } from '@/diagram/flowchartLayout.js'
import { isFlowchartShape } from '@/diagram/freeFloating.js'

// Map the F5 hotkeys to node types (spec B5).
const KEY_TO_TYPE = {
  Enter: 'process',
  d: 'decision',
  t: 'terminator',
  i: 'inputOutput',
}

export function flowchartKeydown(event, store, editorUi) {
  // Free-floating (#122): if the selection is migrated flowchart SHAPES, the build
  // and delete keys operate on shapes + connectors, not the (empty) sub-model below.
  const freeIds = (store.state.selection || []).filter((sid) =>
    isFlowchartShape(store.state.shapes?.find((s) => s.id === sid)),
  )
  if (freeIds.length) return freeFloatingFlowchartKey(event, store, freeIds)
  const model = store.state.flowchart
  if (!model) return false
  const node = selectedNode(store, model)
  if (event.key === 'Delete' || event.key === 'Backspace') {
    // Delete every selected node (single or multi) as one undoable unit.
    const ids = (store.state.selection || []).filter((id) => flowchartNodeById(model, id))
    if (!ids.length) return false
    store.removeFlowchartNodes(ids)
    return true
  }
  if (!node || event.shiftKey || event.altKey) return false
  const nodeType = KEY_TO_TYPE[normaliseKey(event.key)]
  if (!nodeType) return false
  createChild(store, node, nodeType)
  return true
}

// The single selected flowchart node, or null.
function selectedNode(store, model) {
  const id = store.state.selection[0]
  if (!id || store.state.selection.length !== 1) return null
  return flowchartNodeById(model, id) || null
}

// Letter keys are case-insensitive; Enter stays as 'Enter'.
function normaliseKey(key) {
  return key.length === 1 ? key.toLowerCase() : key
}

// Create a connected child below the parent as one undoable unit (Part G6),
// then select it so the next key chains onward.
function createChild(store, parent, nodeType) {
  store.updateFlowchartModel('Add node', (model) => {
    const draft = makeFlowchartNode(nodeType, defaultNodeText(nodeType), 0, 0)
    // Extending from a decision node: attach via a branch port (Yes/No/…) and
    // carry its label onto the edge, the same as the "+"-handle and drag-connect
    // paths — otherwise the new edge leaves the diamond's centre unlabelled,
    // outside the branch system. Fan the child into that branch's lane.
    const branch = pickFreeBranch(parent, model)
    const branchCount = parent.nodeType === 'decision' ? parent.branches.length : 1
    const branchIndex = branch ? parent.branches.findIndex((b) => b.port === branch.port) : null
    const position = placeChild(model, parent.id, { ...draft, ...nodeSize(draft) }, branchIndex, branchCount)
    draft.x = position.x
    draft.y = position.y
    model.nodes.push(draft)
    const edgeOpts = branch ? { fromPort: branch.port, label: branch.label } : {}
    model.edges.push(makeFlowchartEdge(parent.id, draft.id, edgeOpts))
    store.select([draft.id])
  })
}

// A migrated free-floating flowchart node (#122) is a block shape, so only the build
// keys have a flowchart meaning here: Enter->Process, D->Decision, T->Terminator,
// I->Input/Output each add a connected node one level down (auto-placed, arrowed
// edge; a decision fans children into its free branches); Delete/Backspace removes
// the selected node(s) and their edges. The new node is selected so the next key
// chains; text is edited via double-click (the block editor). Other keys are consumed
// as a no-op. Delete MUST be handled here: while a node owns the keyboard the shared
// block delete/nudge fallback is suppressed (useKeyboard ~line 133), so without this
// branch Delete would do nothing at all on a migrated flowchart node.
function freeFloatingFlowchartKey(event, store, ids) {
  if (event.key === 'Delete' || event.key === 'Backspace') {
    store.deleteFlowchartShapes(ids)
    return true
  }
  const id = ids.length === 1 ? ids[0] : null
  if (!id || event.shiftKey || event.altKey) return true
  const nodeType = KEY_TO_TYPE[normaliseKey(event.key)]
  if (!nodeType) return true
  const newId = store.addFlowchartChildShape(id, nodeType)
  if (newId) store.select([newId])
  return true
}
