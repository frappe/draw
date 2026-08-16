// Global keyboard shortcuts -> store actions (spec §7.2/§7.3/§7.5). Listeners
// register on mount and clean up on unmount. Typing inside the text editor (an
// editable element) is left untouched so shortcuts never hijack text entry.

import { onMounted, onBeforeUnmount } from 'vue'
import { useClipboard } from '@/composables/useClipboard.js'
import { useShapeTransform } from '@/composables/useShapeTransform.js'
import { useTextEditing } from '@/composables/useTextEditing.js'
import { getModeStrategy } from '@/stores/useModeStrategy.js'
import { flowchartKeydown } from '@/composables/useFlowchartKeys.js'
import { whiteboardKeydown, deleteWhiteboardSelection } from '@/composables/useWhiteboardKeys.js'
import { toggleShortcutsHelp } from '@/composables/useShortcutsHelp.js'
import { mindmapUi } from '@/stores/mindmapUi.js'
import { isUnifiedDocument } from '@/diagram/schema.js'
import { isMindmapShape, isFlowchartShape } from '@/diagram/freeFloating.js'
import { isEditingText } from '@/utils/dom.js'

const ARROW_DELTAS = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
}

// Number keys are deliberately unbound. 1-9 used to set the fill of the selected
// block shapes, while the whiteboard handler used the SAME keys for its pen/sticky
// palette. On the unified canvas, where both kinds of object live on one surface,
// the two meanings could not both hold — so keyboard colour-picking was removed
// everywhere rather than made to depend on what happened to be selected. Colour is
// chosen from the palette, which is on screen either way.

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
  const transform = useShapeTransform(store)
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
// A dialog or a toolbar menu that reka has open. Both render their content with
// role="dialog" and data-state="open" (DialogContentImpl / PopoverContentImpl); a
// TRIGGER carries data-state without the role, so it never matches here, and a
// closed layer is either unmounted or data-state="closed".
const OPEN_OVERLAY = '[role="dialog"][data-state="open"]'

// Whether something is open over the canvas and owns the keyboard (#463).
//
// This handler binds to WINDOW when the editor mounts, and reka's DismissableLayer
// binds to window too, so the two run in registration order and the editor — mounted
// long before any dialog opens — always goes first. It used to call preventDefault()
// on Escape unconditionally; reka then saw `defaultPrevented` and declined to
// dismiss, so Escape could not close Export, Share or Show info. It was being spent
// deselecting the canvas behind them.
//
// The guard stands the whole handler down rather than special-casing Escape, because
// Escape was not the only key leaking through: with a shape selected behind an open
// dialog, Delete still removed it and `?` still opened the shortcuts sheet on top.
// Exported for the test: this is a DOM predicate, and the alternative is asserting
// it by reading the source, which would not catch a selector that matches nothing.
export function overlayOwnsTheKeyboard() {
  return typeof document !== 'undefined' && document.querySelector(OPEN_OVERLAY) !== null
}

function handleKeydown(event, store, editorUi, clipboard, transform) {
  if (isEditingText(event.target)) return
  if (overlayOwnsTheKeyboard()) return
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
  // Delete/Backspace removes a selected section (chrome, in every diagram type) —
  // before per-mode handling, so it isn't swallowed and works via the keyboard
  // like the section's own X button.
  if ((event.key === 'Delete' || event.key === 'Backspace') && editorUi.state.selectedSectionId) {
    store.removeSection(editorUi.state.selectedSectionId)
    editorUi.clearSection()
    event.preventDefault()
    return
  }
  // Delete/Backspace removes selected whiteboard objects (ink, stickies, lines,
  // tables) in EVERY diagram type that can hold them — before per-mode dispatch, so
  // it works where the whiteboard is not the owning keyboard mode.
  //
  // On a unified document it isn't: the owner resolves to block, or to a selected
  // mind-map / flowchart node. Since nothing else calls removeWhiteboardSelection and
  // the eraser only rubs out ink, a sticky note, line or table placed on a new
  // drawing could be created and never removed. Verified end to end: the same select
  // + Delete that removes a sticky on a legacy whiteboard left it untouched on a
  // unified one.
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (deleteWhiteboardSelection(store)) {
      event.preventDefault()
      return
    }
  }
  if (dispatchModeKey(event, store, editorUi)) {
    event.preventDefault()
    return
  }
  // The whiteboard's own keys on a unified document: the tool letters (P pen, S
  // sticky, E eraser…) and Tab to drop the next sticky beside the selected one.
  //
  // Deliberately AFTER the owner dispatch above, not before. A unified document's
  // owner is block, or whichever mind-map / flowchart node is selected, and those
  // must win: the flowchart uses letter keys of its own, and Tab grows a mind map.
  // So the whiteboard only gets the key once nobody else has claimed it — which is
  // why Tab chains stickies when a sticky is selected and adds a child node when a
  // node is, with no collision between them.
  if (isUnifiedDocument(store.state) && whiteboardKeydown(event, store, editorUi) === true) {
    event.preventDefault()
    return
  }
  // The block type keeps the shared shape shortcuts (delete/escape/nudge). Other
  // types delegate fully to their per-mode handler above (and its no-op stub).
  if (modeKeyboardFor(store, editorUi) !== null) return
  if (handlePlainKey(event, store, editorUi, transform)) event.preventDefault()
}

// Which per-mode keyboard owns the keys right now, as a mode name — or null, which
// means the shared block shortcuts below apply.
//
// A unified document has no type of its own (getModeStrategy falls back to BLOCK,
// whose handler is null), so before #45 the per-type handlers were unreachable on
// it: a mind-map node selected and its toolbar appeared, but Tab, Enter, the arrows
// and Delete — the keys that are the ONLY way to grow a mind map — all did nothing.
// #50 fixed that by reading `focusedFrame || diagramType`; #45 removes focus mode
// altogether and edits both models in place, so the owner now follows whichever
// model holds the SELECTION instead of a container the user had to enter first.
export function keyboardOwner(store) {
  const { keyboardMode } = getModeStrategy(store.state.diagramType)
  if (MODE_KEYBOARD_HANDLERS[keyboardMode]) return keyboardMode
  return selectedNodeOwner(store)
}

// Node ids are prefixed per model ('n…' mind map, 'f…' flowchart, 's…' shape),
// so the owning model of a selected id is unambiguous.
function selectedNodeOwner(store) {
  const id = (store.state.selection || [])[0]
  if (!id) return null
  // Freshly-inserted / legacy content still lives in the sub-model.
  if (store.state.mindmap?.nodes?.some((node) => node.id === id)) return 'mindmap'
  if (store.state.flowchart?.nodes?.some((node) => node.id === id)) return 'flowchart'
  // Free-floating (#122): a migrated node is a role-tagged shape, so ownership
  // follows the selected shape's role, not sub-model membership (now empty).
  const shape = store.state.shapes?.find((s) => s.id === id)
  if (isMindmapShape(shape)) return 'mindmap'
  if (isFlowchartShape(shape)) return 'flowchart'
  return null
}

// The per-mode handler for whichever keyboard owns the keys (null for block/unset).
function modeKeyboardFor(store) {
  return MODE_KEYBOARD_HANDLERS[keyboardOwner(store)] ?? null
}

// Offer a non-modifier key to the active type's handler; returns true if consumed.
function dispatchModeKey(event, store, editorUi) {
  const handler = modeKeyboardFor(store, editorUi)
  if (!handler) return false
  return handler(event, store, editorUi) === true
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
  return handleArrow(event, transform)
}

// Arrow keys nudge the selection; Shift makes the step larger (§7.5).
function handleArrow(event, transform) {
  const delta = ARROW_DELTAS[event.key]
  if (!delta) return false
  return runAction(() => transform.nudge(delta[0], delta[1], event.shiftKey))
}

// Esc exits text-edit, then any armed tool (draw/pen/hand…), else deselects (§7.2).
export function escape(store, editorUi) {
  const text = useTextEditing()
  if (text?.isEditing?.value) return cancelTextEdit(text)
  // Cancel an in-progress mind-map cross-link ("click a target node" mode) before
  // deselecting, so it can't get stuck with no way out.
  if (mindmapUi.pendingLinkSource) {
    mindmapUi.pendingLinkSource = null
    return
  }
  // A selected cross-link deselects like any other selection would.
  if (mindmapUi.selectedCrosslinkId) {
    mindmapUi.selectedCrosslinkId = null
    return
  }
  // A catalog-armed click-to-place starter (mind map / flowchart) cancels first, so
  // the placement cursor disappears without dropping anything (#75) — the arm carries
  // tool === 'select', so this must come before the deselect fall-through.
  if (editorUi.state.pendingStarter) return editorUi.clearStarter()
  // An armed add-comment placement (#108) cancels the same way, before deselect.
  if (editorUi.state.pendingComment) return editorUi.clearComment()
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
