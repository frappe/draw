// The inline cell editor's lifecycle (#344): loading a cell's runs into the
// contenteditable, committing them once when the cell closes, and the keyboard
// and paste handling that goes with it. Split out of WhiteboardTable so that
// component stays about rendering.
//
// A contenteditable rather than a plain input element, so part of a cell can be bold. Vue
// owns no children inside it — runs go in and out through runsToDom/domToRuns,
// because a re-render mid-typing would drop the caret.
//
// Cells wrap now (#556): Enter inserts a line break instead of committing —
// the same newlineIntent list-continuation sticky notes use — and the row
// grows live as it's typed into, exactly mirroring WhiteboardStickyNote.vue's
// growToText/commit split (grow unrecorded while typing, land the final size
// with the text in ONE commit). `multiline: true` on every domToRuns read is
// what keeps an Enter-inserted break instead of collapsing it back to one line.

import { nextTick, ref, toValue, watch } from 'vue'
import { replaceRange, runsEqual, runsToText, trimRuns } from '@/diagram/richText.js'
import { newlineIntent } from '@/diagram/stickyText.js'
import { tableCellRuns, tableCellStyle, colWidthsOf } from '@/diagram/whiteboardModel.js'
import { wrappedCellHeight, wrappedCellLines } from '@/diagram/tableStructure.js'
import {
  domToRuns,
  runsToDom,
  selectionOffsets,
  selectOffsets,
  lineBeforeCaret,
  deleteBeforeCaret,
} from '@/utils/richTextDom.js'

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
  // How many lines the editor currently wraps to — read by WhiteboardTable's
  // editorStyle to decide whether the single-line vertical-centring trick
  // still applies (#507: an EMPTY cell has no text node for flex centring to
  // grab, so that trick stays for one line; once content wraps past one line
  // a line-height spanning the whole (now taller) box would stack each line
  // as tall as the box itself, so a normal per-line value takes over instead).
  const lineCount = ref(1)

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

  // The row height a cell's CURRENT live text needs at its column's width —
  // read on every keystroke (onEditorInput) and once more at commit
  // (flushDraft), so the row never lags a frame behind what was typed.
  function measuredHeight(cell, runs) {
    const current = toValue(table)
    const width = colWidthsOf(current)[cell.col]
    const style = tableCellStyle(current, cell.row, cell.col)
    return wrappedCellHeight(width, runsToText(runs), style.size)
  }

  function flushDraft(previous) {
    if (!editorEl.value) return
    const current = toValue(table)
    const runs = trimRuns(domToRuns(editorEl.value, { multiline: true }))
    // Only write when something actually changed — moving the caret between
    // cells without typing must not push an empty "Edit cell" undo step.
    if (runsEqual(runs, tableCellRuns(current, previous.row, previous.col))) return
    store.setTableCellRuns(current.id, previous.row, previous.col, runs, measuredHeight(previous, runs))
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
    updateLineCount(cell, runs)
  }

  // Live, unrecorded growth while a cell is being typed into — same contract
  // as WhiteboardStickyNote.vue's growToText: growth-only, and never its own
  // undo step. The final height lands with the text in ONE commit (flushDraft).
  function onEditorInput() {
    if (!draftCell.value || !editorEl.value) return
    const runs = domToRuns(editorEl.value, { multiline: true })
    updateLineCount(draftCell.value, runs)
    const current = toValue(table)
    store.growTableRow(current.id, draftCell.value.row, measuredHeight(draftCell.value, runs))
  }

  function updateLineCount(cell, runs) {
    const current = toValue(table)
    const width = colWidthsOf(current)[cell.col]
    const style = tableCellStyle(current, cell.row, cell.col)
    lineCount.value = wrappedCellLines(width, runsToText(runs), style.size).length
  }

  // Enter inserts the break itself (see newlineIntent, shared with the sticky
  // note) instead of committing — a cell that wraps has no reason to treat
  // Enter differently from a note. Escape still cancels; click-away still
  // commits (startCellRangeDrag nulls editingCell on every press, including a
  // press back on the cell being edited).
  function onEditorKeydown(event) {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault()
      const intent = newlineIntent(lineBeforeCaret(editorEl.value))
      deleteBeforeCaret(intent.deleteBefore)
      if (intent.insert) document.execCommand('insertText', false, intent.insert)
      onEditorInput()
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
  // Collapsed to one line on purpose — a cell wraps on its own now, but a pasted
  // line break is not yet a feature this control offers.
  function onPasteText(text) {
    const element = editorEl.value
    const clean = (text || '').replace(/\s+/g, ' ')
    if (!clean || !element) return
    const picked = selectionOffsets(element) || { start: 0, end: 0 }
    runsToDom(element, replaceRange(domToRuns(element, { multiline: true }), picked.start, picked.end, clean))
    const caret = picked.start + clean.length
    selectOffsets(element, caret, caret)
    refreshActiveMarks()
    onEditorInput()
  }

  return { onEditorKeydown, onPasteText, onEditorInput, lineCount }
}
