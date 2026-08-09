// Bold / italic / underline for table cells (#344). Two entry points share this
// logic: with a cell range selected, B/I/U formats every cell in it; with a cell
// open, it formats just the selected words (or the whole cell if nothing is
// selected). Split out of WhiteboardTable so that component stays about
// rendering and the edit lifecycle.
//
// The range path commits through the store. The editor path only rewrites the
// live contenteditable — the edit is committed once, when the cell closes, so
// formatting and typing share a single undo step (#344 constraint).

import { toValue } from 'vue'
import { MARKS, applyMark, markState, resolveMark, runsToText } from '@/diagram/richText.js'
import { isCoveredCell, tableCellRuns } from '@/diagram/whiteboardModel.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { domToRuns, runsToDom, selectionOffsets, selectOffsets } from '@/utils/richTextDom.js'

export function useTableCellFormat({ table, store, editingCell, editorEl, range }) {
  // Per mark: true, false, or 'mixed' — what the toolbar buttons render. Shared
  // state, because the editor and the toolbar hold separate instances of this
  // composable: a local ref would leave the buttons stale after Cmd+B.
  const activeMarks = useWhiteboardUi().cellMarks

  function toggleMark(mark) {
    if (editingCell.value && editorEl.value) toggleInEditor(mark)
    else toggleAcrossRange(mark)
    refreshActiveMarks()
  }

  function refreshActiveMarks() {
    activeMarks.value = Object.fromEntries(MARKS.map((mark) => [mark, stateOf(mark)]))
  }

  function toggleInEditor(mark) {
    const element = editorEl.value
    const runs = domToRuns(element)
    const { start, end } = targetRange(element, runs)
    const inherited = inheritedFor(mark, editingCell.value.row)
    const value = nextValue(markState(runs, start, end, mark), inherited)
    runsToDom(element, applyMark(runs, start, end, mark, value))
    selectOffsets(element, start, end)
  }

  function toggleAcrossRange(mark) {
    const cells = formattableCells()
    if (!cells.length) return
    const current = toValue(table)
    const allOn = cells.every((cell) => cellFullyMarked(cell, mark))
    store.formatTableCells(current.id, cells, (cell) => {
      const runs = tableCellRuns(current, cell.row, cell.col)
      const inherited = inheritedFor(mark, cell.row)
      const value = allOn ? (inherited ? false : undefined) : true
      return applyMark(runs, 0, runsToText(runs).length, mark, value)
    })
  }

  function stateOf(mark) {
    if (editingCell.value && editorEl.value) {
      const runs = domToRuns(editorEl.value)
      const { start, end } = targetRange(editorEl.value, runs)
      const state = markState(runs, start, end, mark)
      return state === undefined ? inheritedFor(mark, editingCell.value.row) : state
    }
    const cells = formattableCells()
    if (!cells.length) return false
    const marked = cells.map((cell) => cellFullyMarked(cell, mark))
    if (marked.every(Boolean)) return true
    return marked.some(Boolean) ? 'mixed' : false
  }

  // What a B/I/U press acts on inside the editor: the selected words, or the
  // whole cell when the caret is just sitting there with nothing selected.
  function targetRange(element, runs) {
    const picked = selectionOffsets(element)
    if (picked && picked.end > picked.start) return picked
    return { start: 0, end: runsToText(runs).length }
  }

  // Turning a mark off normally clears it. Where the cell would inherit it back
  // — a header row bolds its cells — it needs an explicit false to show.
  function nextValue(current, inherited) {
    const isOn = current === undefined ? inherited : current === true
    if (!isOn) return true
    return inherited ? false : undefined
  }

  function inheritedFor(mark, row) {
    return mark === 'bold' && toValue(table).hasHeader === true && row === 0
  }

  function cellFullyMarked(cell, mark) {
    const runs = tableCellRuns(toValue(table), cell.row, cell.col)
    const inherited = inheritedFor(mark, cell.row)
    return runs.length > 0 && runs.every((run) => resolveMark(run, mark, inherited))
  }

  // Only cells holding text can carry a mark, so an all-empty range does
  // nothing rather than pushing an empty undo step.
  function formattableCells() {
    const current = toValue(table)
    return rangeCells().filter((cell) => tableCellRuns(current, cell.row, cell.col).length)
  }

  function rangeCells() {
    const selected = range.value
    if (!selected) return []
    const current = toValue(table)
    const out = []
    for (let row = Math.min(selected.r0, selected.r1); row <= Math.max(selected.r0, selected.r1); row += 1) {
      for (let col = Math.min(selected.c0, selected.c1); col <= Math.max(selected.c0, selected.c1); col += 1) {
        if (!isCoveredCell(current, row, col)) out.push({ row, col })
      }
    }
    return out
  }

  return { activeMarks, toggleMark, refreshActiveMarks }
}
