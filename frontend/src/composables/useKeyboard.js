// Global keyboard shortcuts -> store actions (spec §7.2/§7.3/§7.5). Listeners
// register on mount and clean up on unmount. Typing inside the text editor (an
// editable element) is left untouched so shortcuts never hijack text entry.

import { onMounted, onBeforeUnmount } from 'vue'
import { useClipboard } from '@/composables/useClipboard.js'
import { useShapeTransform } from '@/composables/useShapeTransform.js'
import { useTextEditing } from '@/composables/useTextEditing.js'

const ARROW_DELTAS = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
}

export function useKeyboard(store, editorUi) {
  const clipboard = useClipboard(store)
  const transform = useShapeTransform(store, editorUi)
  const handler = (event) => handleKeydown(event, store, editorUi, clipboard, transform)
  onMounted(() => window.addEventListener('keydown', handler))
  onBeforeUnmount(() => window.removeEventListener('keydown', handler))
  return { store, editorUi }
}

// Route a keydown to the right action, ignoring keys typed into editable fields.
function handleKeydown(event, store, editorUi, clipboard, transform) {
  if (isEditingText(event.target)) return
  const modifier = event.metaKey || event.ctrlKey
  const handled = modifier
    ? handleModifierKey(event, store, clipboard)
    : handlePlainKey(event, store, editorUi, transform)
  if (handled) event.preventDefault()
}

// Skip shortcuts while the user types in an input, textarea, or contentEditable.
function isEditingText(target) {
  if (!target) return false
  const tag = target.tagName
  return target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA'
}

// Cmd/Ctrl shortcuts (§7.3). Shift+Z is treated as redo alongside Y.
function handleModifierKey(event, store, clipboard) {
  const key = event.key.toLowerCase()
  const actions = {
    c: () => clipboard.copy(),
    x: () => clipboard.cut(),
    v: () => clipboard.paste(),
    a: () => store.selectAll(),
    d: () => store.duplicate(store.state.selection),
    z: () => (event.shiftKey ? store.redo() : store.undo()),
    y: () => store.redo(),
  }
  return runAction(actions[key])
}

// Plain keys: delete, escape, and arrow-key nudging (§7.2/§7.5).
function handlePlainKey(event, store, editorUi, transform) {
  if (event.key === 'Delete' || event.key === 'Backspace') {
    return runAction(() => store.removeSelectionOrIds())
  }
  if (event.key === 'Escape') return runAction(() => escape(store, editorUi))
  return handleArrow(event, transform)
}

// Arrow keys nudge the selection; Shift makes the step larger (§7.5).
function handleArrow(event, transform) {
  const delta = ARROW_DELTAS[event.key]
  if (!delta) return false
  return runAction(() => transform.nudge(delta[0], delta[1], event.shiftKey))
}

// Esc exits text-edit, then draw/painter modes, else deselects (§7.2).
function escape(store, editorUi) {
  const text = useTextEditing()
  if (text?.isEditing?.value) return cancelTextEdit(text)
  if (editorUi.state.tool === 'draw') return editorUi.setTool('select')
  if (editorUi.state.formatPainter.active) return editorUi.toggleFormatPainter()
  store.clearSelection()
}

// Close the shared text-editing session (its overlay commits on blur).
function cancelTextEdit(text) {
  text.session.shapeId = null
  text.session.connectorId = null
}

function runAction(action) {
  if (!action) return false
  action()
  return true
}
