import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reactive } from 'vue'

vi.mock('frappe-ui', () => ({ call: () => Promise.resolve({}), toast: { error() {}, success() {} } }))

const { deleteWhiteboardSelection, whiteboardKeydown } = await import('./useWhiteboardKeys.js')
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

// The handler itself. Number keys are unbound on purpose: 1-9 used to pick a palette
// colour here while the block keyboard used the SAME keys to recolour a selected
// shape, and both meanings cannot hold on the unified canvas where the two kinds of
// object share one surface. Colour picking moved entirely to the palette.
describe('whiteboardKeydown', () => {
  const key = (k, extra = {}) => ({ key: k, ...extra })
  const makeUi = () => {
    const calls = []
    return { calls, state: { tool: 'select' }, setTool: (t) => calls.push(t) }
  }

  it('switches tools on a letter key', () => {
    const ui = makeUi()
    expect(whiteboardKeydown(key('p'), makeStore(), ui)).toBe(true)
    expect(whiteboardKeydown(key('S'), makeStore(), ui)).toBe(true) // case-insensitive
    expect(ui.calls).toEqual(['pen', 'sticky'])
  })

  it('binds every documented tool letter', () => {
    const ui = makeUi()
    for (const k of ['v', 'p', 'h', 'e', 't', 's', 'l', 'n', 'g']) {
      expect(whiteboardKeydown(key(k), makeStore(), ui), `${k} is not bound`).toBe(true)
    }
    expect(ui.calls).toEqual(['select', 'pen', 'highlighter', 'eraser', 'text', 'sticky', 'laser', 'line', 'table'])
  })

  it('leaves the number keys alone, in every tool state', () => {
    for (const tool of ['select', 'pen', 'highlighter', 'sticky']) {
      const ui = makeUi()
      ui.state.tool = tool
      for (const k of ['1', '5', '9']) {
        expect(whiteboardKeydown(key(k), makeStore(), ui), `${k} claimed while ${tool} active`).toBe(false)
      }
      expect(ui.calls).toEqual([])
    }
  })

  it('ignores a letter held with Alt, so OS shortcuts still work', () => {
    const ui = makeUi()
    expect(whiteboardKeydown(key('p', { altKey: true }), makeStore(), ui)).toBe(false)
    expect(ui.calls).toEqual([])
  })

  // Tab only claims the key when a sticky is selected. That is what lets the shared
  // dispatcher offer Tab to the whiteboard on a unified document without stealing it
  // from a mind map, where Tab adds a child node.
  it('declines Tab unless a sticky is selected', () => {
    const ui = makeUi()
    expect(whiteboardKeydown(key('Tab'), makeStore(), ui)).toBe(false)

    useWhiteboardUi().state.selected = { kind: 'stroke', id: 'w1' }
    expect(whiteboardKeydown(key('Tab'), makeStore(), ui)).toBe(false)
  })
})
