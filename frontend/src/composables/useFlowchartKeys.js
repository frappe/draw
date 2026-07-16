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
} from '@/diagram/flowchartModel.js'
import { placeChild } from '@/diagram/flowchartLayout.js'

// Map the F5 hotkeys to node types (spec B5).
const KEY_TO_TYPE = {
  Enter: 'process',
  d: 'decision',
  t: 'terminator',
  i: 'inputOutput',
}

export function flowchartKeydown(event, store, editorUi) {
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

// The first decision branch with no outgoing edge yet (so repeated Enter fills
// Yes, then No, …), falling back to the first branch once all are taken. Null for
// non-decision nodes — they extend from the default 'out' port.
function pickFreeBranch(parent, model) {
  if (parent.nodeType !== 'decision' || !parent.branches?.length) return null
  const used = new Set(
    model.edges.filter((e) => e.from.nodeId === parent.id).map((e) => e.from.port),
  )
  return parent.branches.find((b) => !used.has(b.port)) || parent.branches[0]
}
