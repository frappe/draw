import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reactive } from 'vue'

vi.mock('frappe-ui', () => ({ call: () => Promise.resolve({}), toast: { error() {}, success() {} } }))

const { deleteWhiteboardSelection } = await import('./useWhiteboardKeys.js')
const { useWhiteboardUi } = await import('./useWhiteboardUi.js')

// deleteWhiteboardSelection is the ONLY route by which a sticky note, whiteboard
// line or table can be removed: nothing else in the app calls
// removeWhiteboardSelection, and the eraser rubs out ink only. It is exported so the
// shared keyboard dispatcher can reach it on a unified document, where the whiteboard
// is not the owning keyboard mode — without that route, a sticky placed on a new
// drawing could be created and never deleted.

function makeStore() {
  const calls = []
  return {
    calls,
    state: reactive({ selection: [] }),
    removeWhiteboardSelection: (items, ids) => calls.push({ items, ids }),
    clearSelection: () => (calls.push({ cleared: true }), undefined),
  }
}

beforeEach(() => {
  const ui = useWhiteboardUi()
  ui.state.selection = []
  ui.state.selected = null
})

describe('deleteWhiteboardSelection', () => {
  it('deletes the selected whiteboard objects', () => {
    const ui = useWhiteboardUi()
    ui.state.selection = [{ kind: 'sticky', id: 'w2' }]
    const store = makeStore()

    expect(deleteWhiteboardSelection(store)).toBe(true)
    expect(store.calls[0].items).toEqual([{ kind: 'sticky', id: 'w2' }])
  })

  it('takes any block shapes selected alongside them, as one undoable unit', () => {
    const ui = useWhiteboardUi()
    ui.state.selection = [{ kind: 'stroke', id: 'w1' }]
    const store = makeStore()
    store.state.selection = ['s1']

    expect(deleteWhiteboardSelection(store)).toBe(true)
    expect(store.calls[0]).toMatchObject({ items: [{ kind: 'stroke', id: 'w1' }], ids: ['s1'] })
  })

  // The guard that keeps this out of the block path. Without it, Delete on a plain
  // shape selection would be routed through the whiteboard remover and committed
  // under the wrong history entry, on every diagram type.
  it('declines a bare block-shape selection', () => {
    const store = makeStore()
    store.state.selection = ['s1', 's2']

    expect(deleteWhiteboardSelection(store)).toBe(false)
    expect(store.calls).toEqual([])
  })

  it('declines when nothing is selected', () => {
    expect(deleteWhiteboardSelection(makeStore())).toBe(false)
  })
})
