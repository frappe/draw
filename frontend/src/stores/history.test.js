import { describe, it, expect } from 'vitest'
import { createHistory } from './history.js'

// A minimal store-state shape matching what snapshot()/restore() read.
function makeState(overrides = {}) {
  return {
    diagramType: 'block',
    canvas: {},
    shapes: [],
    connectors: [],
    sections: [],
    mindmap: null,
    flowchart: null,
    whiteboard: null,
    selection: [],
    ...overrides,
  }
}

// Count undo steps by unwinding until canUndo is false.
function undoDepth(history) {
  let n = 0
  while (history.canUndo()) {
    history.undo()
    n += 1
  }
  return n
}

describe('history coalescing', () => {
  it('merges a rapid run of the same "Update …" label into one undo step', () => {
    const state = makeState({ shapes: [{ id: 's1', opacity: 1 }] })
    const history = createHistory(state)
    for (let i = 1; i <= 20; i += 1) {
      history.commit('Update shapes', () => (state.shapes[0].opacity = i / 20))
    }
    expect(undoDepth(history)).toBe(1)
    expect(state.shapes[0].opacity).toBe(1) // restored to pre-gesture value
  })

  it('does NOT coalesce Add/Delete labels — each stays its own step', () => {
    const state = makeState()
    const history = createHistory(state)
    history.commit('Add shape', () => state.shapes.push({ id: 'a' }))
    history.commit('Add shape', () => state.shapes.push({ id: 'b' }))
    expect(undoDepth(history)).toBe(2)
  })

  it('starts a fresh step after an undo (no merge into a pre-undo entry)', () => {
    const state = makeState({ shapes: [{ id: 's1', opacity: 1 }] })
    const history = createHistory(state)
    history.commit('Update shapes', () => (state.shapes[0].opacity = 0.5))
    history.undo()
    history.commit('Update shapes', () => (state.shapes[0].opacity = 0.2))
    expect(history.canUndo()).toBe(true)
    history.undo()
    expect(state.shapes[0].opacity).toBe(1)
  })
})

describe('history selection restore', () => {
  it('restores mind-map node selection on undo (not just block shapes)', () => {
    const state = makeState({
      diagramType: 'mindmap',
      mindmap: { rootId: 'r', nodes: [{ id: 'r' }, { id: 'n1' }] },
      selection: ['n1'],
    })
    const history = createHistory(state)
    history.commit('Update node', () => (state.mindmap.nodes[1].text = 'x'))
    state.selection = [] // simulate selection changing after the edit
    history.undo()
    expect(state.selection).toEqual(['n1'])
  })

  it('drops selection ids for objects that no longer exist', () => {
    const state = makeState({ shapes: [{ id: 's1' }], selection: ['s1'] })
    const history = createHistory(state)
    history.commit('Delete shapes', () => {
      state.shapes = []
      state.selection = []
    })
    history.undo()
    // s1 is back, so its selection is restored.
    expect(state.selection).toEqual(['s1'])
  })
})
