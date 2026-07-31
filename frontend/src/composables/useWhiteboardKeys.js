// Per-mode keyboard handler for whiteboard (spec diagram-types C3/C4/W4, Part G5).
// useKeyboard looks this up by the strategy's keyboardMode and only calls it when
// no text field is focused and no Cmd/Ctrl shortcut already matched, so these
// keys are safe to treat as bare (the text-edit guard lives in useKeyboard).
//
// - tool letters: V select, P pen, H highlighter, E eraser, T text, S sticky,
//   L laser, N line, G table (grid).
// - Tab drops an adjacent sticky after the selected one and selects it (W4).
// - Delete/Backspace removes the selected stroke/sticky/line/table (one undoable
//   unit, W3/G6). Returns true when consumed (useKeyboard then preventDefaults).
//
// Number keys are deliberately NOT bound. 1-9 used to pick a palette colour here
// while the block keyboard used the same keys to recolour a selected shape; the two
// meanings could not both hold on the unified canvas, and keyboard colour-picking
// was dropped everywhere rather than made conditional. Colours are chosen from the
// palette, which is always visible.

import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { stickyNoteById } from '@/diagram/whiteboardModel.js'

const TOOL_KEYS = {
  v: 'select', p: 'pen', h: 'highlighter', e: 'eraser',
  t: 'text', s: 'sticky', l: 'laser', n: 'line', g: 'table',
}

export function whiteboardKeydown(event, store, editorUi) {
  if (event.altKey) return false
  if (pickTool(event, editorUi)) return true
  if (event.key === 'Tab') return dropAdjacentSticky(store, useWhiteboardUi())
  if (event.key === 'Delete' || event.key === 'Backspace') return deleteSelected(store, useWhiteboardUi())
  return false
}

function pickTool(event, editorUi) {
  const tool = TOOL_KEYS[event.key.toLowerCase()]
  if (!tool) return false
  editorUi.setTool(tool)
  return true
}

// Tab after placing a note drops the next one just to the right and selects it
// so the user can keep typing-and-tabbing (spec W4).
function dropAdjacentSticky(store, ui) {
  const selected = ui.state.selected
  if (selected?.kind !== 'sticky') return false
  const note = stickyNoteById(store.state.whiteboard, selected.id)
  if (!note) return false
  const id = store.addStickyNote(note.x + note.w + 24, note.y, {
    color: note.color,
    author: (typeof window !== 'undefined' && window.full_name) || '',
  })
  ui.selectSticky(id)
  return true
}

// Delete the selected whiteboard objects as ONE undoable unit, for callers outside
// this mode handler.
//
// The shared dispatcher needs this because the whiteboard is NOT the owning keyboard
// mode on a unified document: that resolves to block, or to a selected mind-map /
// flowchart node. Nothing else in the app calls removeWhiteboardSelection, and the
// eraser only rubs out ink — so without this route a sticky note, line or table
// placed on a new drawing could be created and never removed.
//
// Returns false unless whiteboard objects are actually selected. Delegating a bare
// block-shape selection here would route shape deletion through the whiteboard path
// and commit it under the wrong history entry.
export function deleteWhiteboardSelection(store) {
  const ui = useWhiteboardUi()
  if (!ui.state.selection.length) return false
  return deleteSelected(store, ui)
}

function deleteSelected(store, ui) {
  const wbSelection = ui.state.selection
  const shapeSelection = store.state.selection
  if (!wbSelection.length && !shapeSelection.length) return false
  // Delete every selected whiteboard object AND any selected image shapes (both
  // reachable after Select All) as ONE undoable unit.
  store.removeWhiteboardSelection([...wbSelection], [...shapeSelection])
  ui.clearSelection()
  if (shapeSelection.length) store.clearSelection()
  return true
}
