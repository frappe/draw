// @vitest-environment jsdom
//
// jsdom so startTableMove's window pointer listeners can be exercised with real
// events (same pattern as useMarquee.test.js). Regression for #133: whiteboard
// tables could be selected but never drag-moved — nothing on the table started a
// move gesture, so startGroupMove was only ever reached from the sticky/frame.
import { describe, it, expect, vi } from 'vitest'
import { startTableMove, editTableCellAt, extendStroke } from './useWhiteboardInteraction.js'
import { useWhiteboardUi } from './useWhiteboardUi.js'
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

// #353: double-clicking a cell selected the table but never left the caret in it.
// These go through the REAL useWhiteboardUi singleton, not the fake `ui` above,
// because the bug lived in the interaction between the two: selectTable routes
// through setSelection, which clears editingCell by design.
describe('editTableCellAt', () => {
  it('leaves the cell open after selecting the table', () => {
    const { store, id } = setup()
    const ui = useWhiteboardUi()
    ui.reset()

    expect(editTableCellAt(store, { x: 150, y: 150 })).toBe(true)

    expect(ui.isSelected('table', id), 'the table is selected').toBe(true)
    // Setting the cell BEFORE selecting threw it away again on every double-click.
    expect(ui.state.editingCell, 'selecting the table cleared the cell it just opened').toEqual({
      tableId: id,
      row: 1,
      col: 0,
    })
  })

  it('does nothing when no table is under the point', () => {
    const { store } = setup()
    const ui = useWhiteboardUi()
    ui.reset()

    expect(editTableCellAt(store, { x: 5, y: 5 })).toBe(false)
    expect(ui.state.editingCell).toBeNull()
  })
})

// Freehand capture (#426). A stroke used to be run through RDP on pointer-up, so a
// curve could visibly straighten the moment the pointer lifted. The thinning that
// keeps the document compact happens during capture now, which is why it has to be
// small enough to be invisible and strict enough to still drop dead samples.
describe('thinning a stroke while it is drawn', () => {
  const draw = (...points) => {
    const drawing = { points: [] }
    const grew = points.map((point) => extendStroke(drawing, point))
    return { kept: drawing.points, grew }
  }

  it('keeps the first point, whatever it is', () => {
    const { kept, grew } = draw({ x: 7, y: 9 })
    expect(kept).toEqual([{ x: 7, y: 9 }])
    expect(grew).toEqual([true])
  })

  it('drops a sample that has barely moved, and says so', () => {
    const { kept, grew } = draw({ x: 0, y: 0 }, { x: 0.4, y: 0.2 }, { x: 0.5, y: 0 })
    expect(kept, 'a pointer that has not travelled still added points').toEqual([{ x: 0, y: 0 }])
    expect(grew, 'the caller was told to re-render for a point that was dropped').toEqual([
      true,
      false,
      false,
    ])
  })

  it('keeps every sample a hand actually moves between', () => {
    const drawn = [
      { x: 0, y: 0 },
      { x: 3, y: 1 },
      { x: 6, y: 4 },
      { x: 6, y: 9 },
    ]
    expect(draw(...drawn).kept).toEqual(drawn)
  })

  // The distance is measured from the last point KEPT, not the last one seen —
  // otherwise a slow drag creeping a third of a unit per event is dropped forever
  // and the stroke never grows past its first point.
  it('accumulates a slow drag instead of discarding it forever', () => {
    const creep = Array.from({ length: 6 }, (_, i) => ({ x: (i + 1) * 0.4, y: 0 }))
    const { kept } = draw({ x: 0, y: 0 }, ...creep)
    expect(kept.length, 'a slow drag never reached the threshold').toBeGreaterThan(1)
  })
})
