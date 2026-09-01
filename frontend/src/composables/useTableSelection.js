// The current table cell selection, and every structural action that acts on it
// (#553). One place, because three callers need the same answers: the canvas
// grips (which set the selection), the toolbar's table menu (which acts on it),
// and the table itself (which highlights it).
//
// The selection is a rectangle of cells held on the shared whiteboard UI state
// as `cellRange` — the same field the merge/split range has always used, so a
// row selection, a column selection and a shift-click range are one concept:
// "these cells". A whole row is simply a range that spans every column.

import { computed } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { isCoveredCell, tableById, tableCols, tableRows } from '@/diagram/whiteboardModel.js'
import { isHeaderRow, isHeaderColumn } from '@/diagram/tableStructure.js'

export function useTableSelection() {
  const store = useDiagramStore()
  const ui = useWhiteboardUi()

  // The table being acted on: the one that owns the cell selection, else the one
  // selected on the canvas.
  //
  // That fallback is what makes the grips work at all. They are drawn as soon as a
  // table is SELECTED, which is before any cell has been picked — so on the first
  // click there is no `cellRange` and no `editingCell`, and resolving the table
  // from those alone left every grip pointing at nothing. `selected` rather than
  // `selection`: a row grip acts on one table, so it has no meaning while a
  // multi-selection is being dragged around as a unit.
  const table = computed(() => {
    const owner = ui.state.editingCell?.tableId || ui.state.cellRange?.tableId
    const lone = ui.state.selected?.kind === 'table' ? ui.state.selected.id : null
    const id = owner || lone
    return id ? tableById(store.state.whiteboard || {}, id) : null
  })

  // Bounds in top-left → bottom-right order, whichever way the range was dragged.
  const bounds = computed(() => {
    const open = ui.state.editingCell
    if (open && !ui.state.cellRange) return { top: open.row, left: open.col, bottom: open.row, right: open.col }
    const picked = ui.state.cellRange
    if (!picked || !table.value) return null
    return {
      top: Math.min(picked.r0, picked.r1),
      left: Math.min(picked.c0, picked.c1),
      bottom: Math.max(picked.r0, picked.r1),
      right: Math.max(picked.c0, picked.c1),
    }
  })

  const rows = computed(() => indexRange(bounds.value?.top, bounds.value?.bottom))
  const columns = computed(() => indexRange(bounds.value?.left, bounds.value?.right))

  // Every cell of the selection, skipping the ones a merge covers — those are
  // not drawn and cannot carry their own text or style.
  const cells = computed(() => {
    if (!table.value) return []
    const out = []
    for (const row of rows.value) {
      for (const col of columns.value) {
        if (!isCoveredCell(table.value, row, col)) out.push({ row, col })
      }
    }
    return out
  })

  const spansAllColumns = computed(
    () => !!table.value && columns.value.length === tableCols(table.value),
  )
  const spansAllRows = computed(() => !!table.value && rows.value.length === tableRows(table.value))
  const hasSelection = computed(() => cells.value.length > 0)
  const isMultiCell = computed(() => cells.value.length > 1)
  // "Make header row" reverts when the whole selection is already header.
  const selectionIsHeader = computed(
    () => !!table.value && rows.value.every((row) => isHeaderRow(table.value, row)),
  )
  const selectionIsHeaderColumn = computed(
    () => !!table.value && columns.value.every((col) => isHeaderColumn(table.value, col)),
  )

  function select(r0, c0, r1, c1) {
    if (!table.value) return
    ui.state.cellRange = { tableId: table.value.id, r0, c0, r1, c1 }
    ui.state.editingCell = null
  }

  function selectRow(row, through = row) {
    if (table.value) select(row, 0, through, tableCols(table.value) - 1)
  }

  function selectColumn(col, through = col) {
    if (table.value) select(0, col, tableRows(table.value) - 1, through)
  }

  function selectWholeTable() {
    if (table.value) select(0, 0, tableRows(table.value) - 1, tableCols(table.value) - 1)
  }

  // ----- structural actions -------------------------------------------------
  // Each keeps the selection pointing at the same place afterwards, so a second
  // click on the same button repeats the action rather than hunting for the row.

  function insertRowAbove() {
    onSelection((id, at) => {
      store.insertTableRow(id, at.top)
      selectRow(at.top)
    })
  }

  function insertRowBelow() {
    onSelection((id, at) => {
      store.insertTableRow(id, at.bottom + 1)
      selectRow(at.bottom + 1)
    })
  }

  function deleteRows() {
    const targets = rows.value
    onSelection((id) => {
      store.deleteTableRows(id, targets)
      clearSelection()
    })
  }

  function insertColumnBefore() {
    onSelection((id, at) => {
      store.insertTableColumn(id, at.left)
      selectColumn(at.left)
    })
  }

  function insertColumnAfter() {
    onSelection((id, at) => {
      store.insertTableColumn(id, at.right + 1)
      selectColumn(at.right + 1)
    })
  }

  function deleteColumns() {
    const targets = columns.value
    onSelection((id) => {
      store.deleteTableColumns(id, targets)
      clearSelection()
    })
  }

  // The header runs from the top down to the selection's last row, or ends just
  // above it when those rows are already header (#553).
  function toggleHeaderRows() {
    onSelection((id, at) => store.toggleTableHeaderThroughRow(id, at.bottom))
  }

  // The header runs from the left out to the selection's last column, or ends
  // just before it when those columns are already header — the column mirror
  // of toggleHeaderRows (#556).
  function toggleHeaderColumns() {
    onSelection((id, at) => store.toggleTableHeaderThroughColumn(id, at.right))
  }

  function clearContents() {
    const targets = cells.value
    onSelection((id) => store.clearTableCells(id, targets))
  }

  function deleteTable() {
    const current = table.value
    if (!current) return
    clearSelection()
    ui.clearSelection()
    store.removeTable(current.id)
  }

  function clearSelection() {
    ui.state.cellRange = null
    ui.state.editingCell = null
  }

  // Runs `action(tableId, bounds)` when there is a table AND a selection inside
  // it, and does nothing otherwise — the single place that guard lives.
  //
  // The bounds are handed IN rather than read again inside the action: an insert
  // shifts every row below it, so a second read of `bounds` mid-action would name
  // a different row than the one the user picked.
  function onSelection(action) {
    if (!table.value || !bounds.value) return
    action(table.value.id, bounds.value)
  }

  return {
    table,
    bounds,
    rows,
    columns,
    cells,
    hasSelection,
    isMultiCell,
    spansAllRows,
    spansAllColumns,
    selectionIsHeader,
    selectionIsHeaderColumn,
    select,
    selectRow,
    selectColumn,
    selectWholeTable,
    clearSelection,
    insertRowAbove,
    insertRowBelow,
    deleteRows,
    insertColumnBefore,
    insertColumnAfter,
    deleteColumns,
    toggleHeaderRows,
    toggleHeaderColumns,
    clearContents,
    deleteTable,
  }
}

function indexRange(from, to) {
  if (from === undefined || from === null) return []
  return Array.from({ length: to - from + 1 }, (_, offset) => from + offset)
}
