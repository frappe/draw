// Global keyboard shortcuts -> store actions (spec §7.2/§7.3/§7.5). Listeners
// register on mount and clean up on unmount. Typing inside the text editor (an
// editable element) is left untouched so shortcuts never hijack text entry.

import { onMounted, onBeforeUnmount } from 'vue'
import { useClipboard } from '@/composables/useClipboard.js'
import { useShapeTransform } from '@/composables/useShapeTransform.js'
import { useTextEditing } from '@/composables/useTextEditing.js'
import { getModeStrategy } from '@/stores/useModeStrategy.js'
import { flowchartKeydown } from '@/composables/useFlowchartKeys.js'
import { whiteboardKeydown } from '@/composables/useWhiteboardKeys.js'
import { toggleShortcutsHelp } from '@/composables/useShortcutsHelp.js'

const ARROW_DELTAS = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
}

// Block-mode quick fills: number keys 1-9 set the fill of the selected shapes
// (the whiteboard has its own 1-9 palette in useWhiteboardKeys) — spec 9.5.
const NUMBER_COLORS = [
  '#EFF6FF', '#F4FFF6', '#FDFAED', '#FCEAF5', '#F3F3F3',
  '#FDECEC', '#E7F8FB', '#1F2933', '#FFFFFF',
]

// Per-mode keyboard handlers (spec diagram-types Part G5), keyed by the
// strategy's keyboardMode. Each handler is (event, store, editorUi) and returns
// true when it consumed the key (so the global dispatcher calls preventDefault).
// `block` is null (it uses the shared shape shortcuts below). `mindmap` is owned
// by the M2 agent; its handler registers here when built (left null for now so
// the seam exists without forcing a dependency).
const MODE_KEYBOARD_HANDLERS = {
  block: null,
  mindmap: null,
  flowchart: flowchartKeydown,
  whiteboard: whiteboardKeydown,
}

// Allow the mind-map agent (M2) to register its handler without editing this
// file: registerModeKeyboardHandler('mindmap', fn).
export function registerModeKeyboardHandler(keyboardMode, handler) {
  MODE_KEYBOARD_HANDLERS[keyboardMode] = handler
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
// Mode-aware (Part G5): cut/copy/paste/undo/redo modifier shortcuts stay shared
// across all types; non-modifier keys are first offered to the active type's
// per-mode handler (mindmap navigation, flowchart letters, whiteboard numbers),
// then fall back to the shared block shortcuts only for the block type.
function handleKeydown(event, store, editorUi, clipboard, transform) {
  if (isEditingText(event.target)) return
  const modifier = event.metaKey || event.ctrlKey
  if (modifier) {
    if (handleModifierKey(event, store, clipboard, editorUi)) event.preventDefault()
    return
  }
  // Shift+1 fits the diagram to the viewport (Figma convention).
  if (event.shiftKey && event.code === 'Digit1') {
    editorUi.fit()
    event.preventDefault()
    return
  }
  // Escape is universal across every mode: it cancels an armed draw tool (so the
  // crosshair disappears), exits painter, or deselects — before any per-mode key
  // handling gets a chance to swallow it.
  if (event.key === 'Escape') {
    escape(store, editorUi)
    event.preventDefault()
    return
  }
  // `?` opens the shortcuts cheat-sheet from any diagram type.
  if (event.key === '?') {
    toggleShortcutsHelp()
    event.preventDefault()
    return
  }
  if (dispatchModeKey(event, store, editorUi)) {
    event.preventDefault()
    return
  }
  // The block type keeps the shared shape shortcuts (delete/escape/nudge). Other
  // types delegate fully to their per-mode handler above (and its no-op stub).
  if (modeKeyboardFor(store) !== null) return
  if (handlePlainKey(event, store, editorUi, transform)) event.preventDefault()
}

// The per-mode handler for the active diagram type (or null for block/unset).
function modeKeyboardFor(store) {
  const strategy = getModeStrategy(store.state.diagramType)
  return MODE_KEYBOARD_HANDLERS[strategy.keyboardMode] ?? null
}

// Offer a non-modifier key to the active type's handler; returns true if consumed.
function dispatchModeKey(event, store, editorUi) {
  const handler = modeKeyboardFor(store)
  if (!handler) return false
  return handler(event, store, editorUi) === true
}

// Skip shortcuts while the user types in an input, textarea, or contentEditable.
function isEditingText(target) {
  if (!target) return false
  const tag = target.tagName
  return target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA'
}

// Cmd/Ctrl shortcuts (§7.3). Shift+Z is treated as redo alongside Y.
function handleModifierKey(event, store, clipboard, editorUi) {
  const key = event.key.toLowerCase()
  const actions = {
    c: () => clipboard.copy(),
    x: () => clipboard.cut(),
    // Paste (Cmd/Ctrl+V) is handled by the native 'paste' event in
    // useCanvasPaste (so an OS image can be pasted too); not mapped here to
    // avoid pasting twice.
    a: () => store.selectAll(),
    d: () => store.duplicate(store.state.selection),
    z: () => (event.shiftKey ? store.redo() : store.undo()),
    y: () => store.redo(),
    0: () => editorUi.reset100(), // ⌘/Ctrl+0 → 100%
  }
  return runAction(actions[key])
}

// Plain keys: delete, escape, and arrow-key nudging (§7.2/§7.5).
function handlePlainKey(event, store, editorUi, transform) {
  if (event.key === 'Delete' || event.key === 'Backspace') {
    return runAction(() => store.removeSelectionOrIds())
  }
  if (applyNumberColor(event, store)) return true
  return handleArrow(event, transform)
}

// 1-9 recolour the fill of the selected block shapes (no-op without a shape
// selection, so the key isn't swallowed).
function applyNumberColor(event, store) {
  const index = '123456789'.indexOf(event.key)
  if (index === -1) return false
  const ids = store.state.selection.filter((id) => store.shapeById(id))
  if (!ids.length) return false
  store.updateShapes(ids, { fill: NUMBER_COLORS[index] })
  return true
}

// Arrow keys nudge the selection; Shift makes the step larger (§7.5).
function handleArrow(event, transform) {
  const delta = ARROW_DELTAS[event.key]
  if (!delta) return false
  return runAction(() => transform.nudge(delta[0], delta[1], event.shiftKey))
}

// Esc exits text-edit, then any armed tool (draw/pen/hand…), else deselects (§7.2).
function escape(store, editorUi) {
  const text = useTextEditing()
  if (text?.isEditing?.value) return cancelTextEdit(text)
  if (editorUi.state.tool !== 'select') return editorUi.setTool('select')
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
