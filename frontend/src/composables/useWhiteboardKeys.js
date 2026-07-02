// Per-mode keyboard handler for whiteboard (spec diagram-types C3/C4/W4, Part G5).
// useKeyboard looks this up by the strategy's keyboardMode and only calls it when
// no text field is focused and no Cmd/Ctrl shortcut already matched, so these
// keys are safe to treat as bare (the text-edit guard lives in useKeyboard).
//
// - number keys 1-9 pick a palette color while pen/highlighter/sticky is active
//   (pen/highlighter set the pen color, sticky sets the sticky color) (W4).
// - tool letters: V select, P pen, H highlighter, E eraser, T text, S sticky,
//   L laser, N line, G table (grid).
// - Tab drops an adjacent sticky after the selected one and selects it (W4).
// - Delete/Backspace removes the selected stroke/sticky/line/table (one undoable
//   unit, W3/G6). Returns true when consumed (useKeyboard then preventDefaults).

import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { PEN_COLORS, STICKY_COLORS } from '@/diagram/whiteboardColors.js'
import { stickyNoteById } from '@/diagram/whiteboardModel.js'

const TOOL_KEYS = {
  v: 'select', p: 'pen', h: 'highlighter', e: 'eraser',
  t: 'text', s: 'sticky', l: 'laser', n: 'line', g: 'table',
  f: 'frame', m: 'stamp',
}

export function whiteboardKeydown(event, store, editorUi) {
  if (event.altKey) return false
  if (pickColor(event, editorUi, useWhiteboardUi())) return true
  if (pickTool(event, editorUi)) return true
  if (event.key === 'Tab') return dropAdjacentSticky(store, useWhiteboardUi())
  if (event.key === 'Delete' || event.key === 'Backspace') return deleteSelected(store, useWhiteboardUi())
  return false
}

// 1-9 select a palette color for the active drawing tool (spec W4).
function pickColor(event, editorUi, ui) {
  const index = '123456789'.indexOf(event.key)
  if (index === -1) return false
  const tool = editorUi.state.tool
  if (tool === 'pen' || tool === 'highlighter') {
    ui.state.penColor = PEN_COLORS[index]
    return true
  }
  if (tool === 'sticky') {
    ui.state.stickyColor = STICKY_COLORS[index]
    return true
  }
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

function deleteSelected(store, ui) {
  const selection = ui.state.selection
  if (!selection.length) return false
  const remove = {
    stroke: store.removeStroke,
    sticky: store.removeStickyNote,
    line: store.removeLine,
    table: store.removeTable,
    frame: store.removeFrame,
    stamp: store.removeStamp,
  }
  // Delete every selected object (single or multi); one undoable unit per object.
  for (const item of [...selection]) remove[item.kind]?.(item.id)
  ui.clearSelection()
  return true
}
