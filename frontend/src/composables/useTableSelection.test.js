// The table cell selection and the structural actions on it (#553).
//
// The store is provided through inject, so it is mocked here rather than mounted:
// these are the composable's own rules, and every one of them is reachable from a
// grip press with no component in the way. useWhiteboardUi is a module singleton
// and needs no mocking — the tests drive its state exactly as a gesture leaves it.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createDiagramStore } from '@/stores/useDiagramStore.js'
import { createDiagramDocument } from '@/diagram/schema.js'
import { tableById } from '@/diagram/whiteboardModel.js'
import { tableHeaderRows, tableHeaderCols } from '@/diagram/tableStructure.js'

vi.mock('@/stores/useDiagramStore.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useDiagramStore: () => globalThis.__tableSelectionStore }
})

const { useTableSelection } = await import('@/composables/useTableSelection.js')
const { useWhiteboardUi } = await import('@/composables/useWhiteboardUi.js')

// A table on the canvas, selected as a lone object — the state one click leaves,
// and the state the grips are drawn in.
function setup({ rows = 3, cols = 3 } = {}) {
  const store = createDiagramStore(createDiagramDocument(undefined, 'unified'))
  globalThis.__tableSelectionStore = store
  const id = store.addTable(0, 0, { rows, cols })
  const ui = useWhiteboardUi()
  ui.state.selection = [{ kind: 'table', id }]
  ui.state.selected = { kind: 'table', id }
  ui.state.cellRange = null
  ui.state.editingCell = null
  return { store, ui, id, table: () => tableById(store.state.whiteboard, id) }
}

beforeEach(() => {
  const ui = useWhiteboardUi()
  ui.state.selection = []
  ui.state.selected = null
  ui.state.cellRange = null
  ui.state.editingCell = null
})

// The regression this file exists for. The grips render as soon as a table is
// selected, which is BEFORE any cell has been picked. Resolving the table from the
// cell selection alone left every grip pointing at no table, so a press on one did
// nothing at all — and the "+" went further and threw, because the insert helpers
// read `bounds.value.top` outside their own guard.
describe('a table selected on the canvas, with no cell picked yet', () => {
  it('selects a whole row from its grip', () => {
    const { ui } = setup()
    useTableSelection().selectRow(1)
    expect(ui.state.cellRange).toMatchObject({ r0: 1, c0: 0, r1: 1, c1: 2 })
  })

  it('selects a whole column from its grip', () => {
    const { ui } = setup()
    useTableSelection().selectColumn(2)
    expect(ui.state.cellRange).toMatchObject({ r0: 0, c0: 2, r1: 2, c1: 2 })
  })

  it('selects the whole table from the corner grip', () => {
    const { ui } = setup()
    const selection = useTableSelection()
    selection.selectWholeTable()
    expect(selection.spansAllRows.value).toBe(true)
    expect(selection.spansAllColumns.value).toBe(true)
    expect(ui.state.cellRange).toMatchObject({ r0: 0, c0: 0, r1: 2, c1: 2 })
  })

  it('inserts a row from the grip "+", the way TableGrips drives it', () => {
    const { table } = setup()
    const selection = useTableSelection()
    selection.selectRow(0)
    selection.insertRowBelow()
    expect(table().rows).toBe(4)
  })
})

// Nothing selected at all: every action is a no-op, never a throw. These run from
// pointer handlers, where an exception is silent and leaves the gesture half done.
describe('with nothing selected', () => {
  it('does not throw from any structural action', () => {
    setup()
    const ui = useWhiteboardUi()
    ui.state.selection = []
    ui.state.selected = null
    const selection = useTableSelection()
    for (const act of [
      selection.insertRowAbove,
      selection.insertRowBelow,
      selection.deleteRows,
      selection.insertColumnBefore,
      selection.insertColumnAfter,
      selection.deleteColumns,
      selection.toggleHeaderRows,
      selection.toggleHeaderColumns,
      selection.clearContents,
      selection.deleteTable,
    ]) {
      expect(act).not.toThrow()
    }
  })
})

describe('structural actions keep the selection usable', () => {
  it('leaves the new row selected, so a second insert repeats the action', () => {
    const { table } = setup()
    const selection = useTableSelection()
    selection.selectRow(1)
    selection.insertRowAbove()
    expect(selection.rows.value).toEqual([1])
    selection.insertRowAbove()
    expect(table().rows).toBe(5)
  })

  it('reads the insert point BEFORE the edit shifts the rows below it', () => {
    const { store, id, table } = setup()
    store.setTableCell(id, 1, 0, 'second')
    const selection = useTableSelection()
    selection.selectRow(1)
    selection.insertRowAbove()
    // The row that carried the text moved down; the new row is the empty one.
    expect(table().cells['2,0']).toBe('second')
    expect(table().cells['1,0']).toBeUndefined()
  })

  it('deletes every row of a dragged range in one undo step', () => {
    const { store, table } = setup({ rows: 4 })
    const selection = useTableSelection()
    selection.select(1, 0, 2, 2)
    selection.deleteRows()
    expect(table().rows).toBe(2)
    store.undo()
    expect(table().rows).toBe(4)
  })

  it('makes the selected rows the header, and reverts them', () => {
    const { table } = setup()
    const selection = useTableSelection()
    selection.selectRow(1)
    selection.toggleHeaderRows()
    expect(tableHeaderRows(table())).toBe(2)
    selection.selectRow(1)
    selection.toggleHeaderRows()
    expect(tableHeaderRows(table())).toBe(1)
  })

  it('makes the selected columns the header, and reverts them, independently of the header row', () => {
    const { table } = setup()
    const selection = useTableSelection()
    selection.selectRow(1)
    selection.toggleHeaderRows()
    selection.selectColumn(1)
    selection.toggleHeaderColumns()
    expect(tableHeaderCols(table())).toBe(2)
    expect(tableHeaderRows(table()), 'the header row is untouched by the column toggle').toBe(2)
    selection.selectColumn(1)
    selection.toggleHeaderColumns()
    expect(tableHeaderCols(table())).toBe(1)
  })

  it('clears the text of the selected cells and keeps the table', () => {
    const { store, id, table } = setup()
    store.setTableCell(id, 0, 0, 'keep')
    store.setTableCell(id, 1, 1, 'drop')
    const selection = useTableSelection()
    selection.selectRow(1)
    selection.clearContents()
    expect(table().cells['1,1']).toBeUndefined()
    expect(table().cells['0,0']).toBe('keep')
  })
})
