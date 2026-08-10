import { describe, it, expect } from 'vitest'
import { computed } from 'vue'
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

describe('history depth is reactive', () => {
  // The store publishes canUndo/canRedo as computeds over these, and the toolbar
  // binds its disabled state to them. While the stacks were plain arrays the
  // computed took no dependency, cached "false" at creation and never changed —
  // so Undo sat greyed out no matter how much was edited.
  it('invalidates a computed that reads it', () => {
    const state = makeState()
    const history = createHistory(state)
    const canUndo = computed(() => history.canUndo())
    const canRedo = computed(() => history.canRedo())
    expect(canUndo.value).toBe(false)
    expect(canRedo.value).toBe(false)

    history.commit('Add shape', () => state.shapes.push({ id: 'a' }))
    expect(canUndo.value).toBe(true)

    history.undo()
    expect(canUndo.value).toBe(false)
    expect(canRedo.value).toBe(true)

    history.redo()
    expect(canRedo.value).toBe(false)

    history.clear()
    expect(canUndo.value).toBe(false)
  })

  // Coalescing returns early on its own path, and a run of slider updates must
  // still light Undo up on the FIRST commit of the run.
  it('counts a coalesced run as one available step', () => {
    const state = makeState({ shapes: [{ id: 's1', opacity: 1 }] })
    const history = createHistory(state)
    const canUndo = computed(() => history.canUndo())
    for (let i = 1; i <= 5; i += 1) {
      history.commit('Update shapes', () => (state.shapes[0].opacity = i / 5))
    }
    expect(canUndo.value).toBe(true)
    history.undo()
    expect(canUndo.value).toBe(false)
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
