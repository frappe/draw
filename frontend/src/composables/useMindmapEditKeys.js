// In-edit keyboard handling for a mind-map node's contentEditable field (spec A5,
// Part G5). The global keyboard dispatcher ignores events from editable targets,
// so the structural keys must be handled here, on the field itself:
//   Tab          -> add a child of the node being edited, edit it
//   Enter        -> add a sibling after it, edit it
//   Shift+Enter  -> newline within the node text (let the browser insert it)
//   Escape       -> exit edit, keep the node, blur the field
// Text has already been committed by the caller for the create cases.

import { isRoot } from '@/diagram/mindmapModel.js'
import { selectNode, beginEdit, endEdit } from '@/stores/mindmapUi.js'

export function mindmapKeydownInEdit(event, id, store, field) {
  if (event.key === 'Tab') return createChild(event, store, id)
  if (event.key === 'Enter' && !event.shiftKey) return createSibling(event, store, id)
  if (event.key === 'Escape') return exitEdit(event, field)
  // Shift+Enter and ordinary typing fall through to the browser.
}

function createChild(event, store, id) {
  event.preventDefault()
  enterEdit(store, store.addChildNode(id))
}

function createSibling(event, store, id) {
  event.preventDefault()
  const model = store.state.mindmap
  const newId = isRoot(model, id) ? store.addChildNode(id) : store.addSiblingNode(id)
  enterEdit(store, newId)
}

function exitEdit(event, field) {
  event.preventDefault()
  endEdit()
  field?.blur()
}

// Select the new node and re-open editing on it (Vue re-renders the field).
function enterEdit(store, newId) {
  if (!newId) return
  selectNode(store, newId)
  beginEdit(newId)
}
