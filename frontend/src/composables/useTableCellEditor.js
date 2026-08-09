// The inline cell editor's lifecycle (#344): loading a cell's runs into the
// contenteditable, committing them once when the cell closes, and the keyboard
// and paste handling that goes with it. Split out of WhiteboardTable so that
// component stays about rendering.
//
// A contenteditable rather than an <input>, so part of a cell can be bold. Vue
// owns no children inside it — runs go in and out through runsToDom/domToRuns,
// because a re-render mid-typing would drop the caret.

import { nextTick, ref, toValue, watch } from 'vue'
import { replaceRange, runsEqual, runsToText, trimRuns } from '@/diagram/richText.js'
import { tableCellRuns } from '@/diagram/whiteboardModel.js'
import { domToRuns, runsToDom, selectionOffsets, selectOffsets } from '@/utils/richTextDom.js'

const SHORTCUT_MARKS = { b: 'bold', i: 'italic', u: 'underline' }

export function useTableCellEditor({
  table,
  store,
  editingCell,
  editorEl,
  refreshActiveMarks,
  toggleMark,
  closeEditor,
}) {
  // The cell the editor currently holds. We commit against THIS, not
  // editingCell.value, because switching cells (the T2 single-click path) reuses
  // the same editor and advances editingCell synchronously — so a commit keyed
  // on editingCell.value would write to the wrong cell (or lose the text).
  const draftCell = ref(null)
  const cancelling = ref(false)

  // The single commit point. On every transition — cell A → cell B, or → null
  // (Enter / click-away) — flush the outgoing cell unless Escape cancelled it,
  // then load the incoming one. No @blur handler: it raced with the reused
  // editor and double-committed to the wrong cell. The watch runs before Vue
  // re-renders, so the editor still holds the outgoing cell's content here.
  watch(
    editingCell,
    (cell) => {
      if (draftCell.value && !cancelling.value) flushDraft(draftCell.value)
      cancelling.value = false
      if (!cell) {
        draftCell.value = null
        return
      }
      draftCell.value = { row: cell.row, col: cell.col }
      // Load synchronously when the editor is already mounted (the cell → cell
      // hop reuses it), so the outgoing text never shows for a frame in the
      // incoming cell's box. On first open the element does not exist yet.
      if (editorEl.value) loadEditor(cell)
      else nextTick(() => loadEditor(cell))
    },
    { immediate: true },
  )

  function flushDraft(previous) {
    if (!editorEl.value) return
    const current = toValue(table)
    const runs = trimRuns(domToRuns(editorEl.value))
    // Only write when something actually changed — moving the caret between
    // cells without typing must not push an empty "Edit cell" undo step.
    if (runsEqual(runs, tableCellRuns(current, previous.row, previous.col))) return
    store.setTableCellRuns(current.id, previous.row, previous.col, runs)
  }

  function loadEditor(cell) {
    const element = editorEl.value
    if (!element) return
    const runs = tableCellRuns(toValue(table), cell.row, cell.col)
    runsToDom(element, runs)
    element.focus()
    const end = runsToText(runs).length
    selectOffsets(element, end, end)
    refreshActiveMarks()
  }

  function onEditorKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault()
      closeEditor() // the watch flushes draftCell for us
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelling.value = true // tell the watch to discard, not commit
      closeEditor()
      return
    }
    const mark = (event.metaKey || event.ctrlKey) && SHORTCUT_MARKS[event.key.toLowerCase()]
    if (mark) {
      event.preventDefault()
      toggleMark(mark)
    }
  }

  // Paste and drop are forced to plain text: the model stores runs, and letting
  // arbitrary markup into a contenteditable is how script content reaches the page.
  function onPasteText(text) {
    const element = editorEl.value
    const clean = (text || '').replace(/\s+/g, ' ')
    if (!clean || !element) return
    const picked = selectionOffsets(element) || { start: 0, end: 0 }
    runsToDom(element, replaceRange(domToRuns(element), picked.start, picked.end, clean))
    const caret = picked.start + clean.length
    selectOffsets(element, caret, caret)
    refreshActiveMarks()
  }

  return { onEditorKeydown, onPasteText }
}
