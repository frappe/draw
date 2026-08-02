// @vitest-environment jsdom
//
// jsdom so startTableMove's window pointer listeners can be exercised with real
// events (same pattern as useMarquee.test.js). Regression for #133: whiteboard
// tables could be selected but never drag-moved — nothing on the table started a
// move gesture, so startGroupMove was only ever reached from the sticky/frame.
import { describe, it, expect, vi } from 'vitest'
import { startTableMove } from './useWhiteboardInteraction.js'
import { createWhiteboard, addTable } from '@/diagram/whiteboardModel.js'

// A MouseEvent carries clientX/clientY and dispatches to 'pointer*' listeners in
// jsdom, which lacks a PointerEvent constructor.
function pointer(type, x, y) {
  window.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y }))
}

// The whiteboard table sits at (100,100) with 120×40 cells (model defaults) and is
// the sole selection; the component has already verified the tool/selection and
// stopped propagation before handing the press to startTableMove.
function setup() {
  const model = createWhiteboard()
  const id = addTable(model, 100, 100, { rows: 3, cols: 3, color: '#000' })
  const table = model.tables.find((t) => t.id === id)
  const store = {
    state: { whiteboard: model },
    // The real store snapshots history then applies the mutation; the unit only
    // needs the mutation applied so the committed position can be read back.
    updateWhiteboardModel: vi.fn((label, fn) => fn(model)),
  }
  const editorUi = { viewport: { state: { panX: 0, panY: 0, zoom: 1 } } }
  const ui = { state: { selection: [{ kind: 'table', id }], editingCell: null } }
  return { model, id, table, store, editorUi, ui }
}

describe('startTableMove', () => {
  it('drags a selected table past the threshold and commits the move once', () => {
    const { table, store, editorUi, ui } = setup()
    const x0 = table.x
    const y0 = table.y

    // Press inside the table, drag well past the threshold, release.
    startTableMove({ clientX: 120, clientY: 120 }, store, editorUi, ui, table, { x: 120, y: 120 })
    pointer('pointermove', 170, 150) // +50, +30 screen px (zoom 1 → canvas units)
    pointer('pointerup', 170, 150)

    expect(table.x).toBe(x0 + 50)
    expect(table.y).toBe(y0 + 30)
    // One undoable unit, and a move never opens the inline cell editor.
    expect(store.updateWhiteboardModel).toHaveBeenCalledTimes(1)
    expect(store.updateWhiteboardModel).toHaveBeenCalledWith('Move objects', expect.any(Function))
    expect(ui.state.editingCell).toBeNull()
  })

  it('treats a sub-threshold press as a click that opens the cell under it (no move)', () => {
    const { table, store, editorUi, ui, id } = setup()
    const x0 = table.x
    const y0 = table.y

    // A 1px wiggle (below the drag threshold) then release: this stays a plain click.
    startTableMove({ clientX: 150, clientY: 150 }, store, editorUi, ui, table, { x: 150, y: 150 })
    pointer('pointermove', 151, 151)
    pointer('pointerup', 151, 151)

    expect(table.x, 'a click must not move the table').toBe(x0)
    expect(table.y).toBe(y0)
    expect(store.updateWhiteboardModel).not.toHaveBeenCalled()
    // (150,150) is 50px right / 50px down of the origin → column 0, row 1 (T2 edit).
    expect(ui.state.editingCell).toEqual({ tableId: id, row: 1, col: 0 })
  })

  it('abandons a cancelled press: no move, no cell-edit, and no leaked listener', () => {
    const { table, store, editorUi, ui } = setup()
    const x0 = table.x

    startTableMove({ clientX: 150, clientY: 150 }, store, editorUi, ui, table, { x: 150, y: 150 })
    window.dispatchEvent(new Event('pointercancel'))
    pointer('pointermove', 300, 300) // a leaked move listener would shift the table here

    expect(table.x, 'a cancelled press leaks no move listener').toBe(x0)
    expect(ui.state.editingCell, 'a cancelled press must not open the editor').toBeNull()
    expect(store.updateWhiteboardModel).not.toHaveBeenCalled()
  })

  it('leaves a co-selected sticky note moved alongside the table (group move)', () => {
    const { model, table, store, editorUi, ui, id } = setup()
    // Add a sticky and select both, so the drag must translate the whole group.
    const stickyId = model.stickyNotes.push({ id: 's1', x: 400, y: 400, w: 180, h: 180 }) && 's1'
    ui.state.selection = [
      { kind: 'table', id },
      { kind: 'sticky', id: stickyId },
    ]

    startTableMove({ clientX: 120, clientY: 120 }, store, editorUi, ui, table, { x: 120, y: 120 })
    pointer('pointermove', 130, 120) // +10, 0
    pointer('pointerup', 130, 120)

    expect(table.x).toBe(110)
    expect(model.stickyNotes[0].x, 'the co-selected sticky moves with the table').toBe(410)
  })
})
