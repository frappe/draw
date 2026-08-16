import { describe, it, expect, vi } from 'vitest'
import { mindmapKeydown } from './useMindmapKeys.js'
import { ROLE } from '@/diagram/freeFloating.js'
import { useTextEditing } from '@/composables/useTextEditing.js'
import { mindmapUi } from '@/stores/mindmapUi.js'

// A migrated mind-map node is a role-tagged shape and `state.mindmap` is null after
// the #122 flip, so these cover the free-floating keyboard branch. The growth keys
// used to select the new node and stop there, which left it sitting empty waiting for
// a double-click the user had already effectively asked for (#514).
const mmShape = {
  id: 'n1', role: ROLE.mindmapNode, x: 0, y: 0, w: 140, h: 40,
  mindmap: { parentId: 'root', order: 0, depth: 1 },
}

function fakeStore() {
  return {
    state: { selection: ['n1'], shapes: [mmShape], connectors: [], mindmap: null },
    addChildNode: vi.fn(() => 'nNEW'),
    addSiblingNode: vi.fn(() => 'nNEW'),
    deleteMindmapSubtrees: vi.fn(),
    select: vi.fn(),
  }
}

describe('mindmapKeydown — migrated free-floating node', () => {
  it('Tab adds a child and puts the caret in it (#514)', () => {
    const store = fakeStore()
    expect(mindmapKeydown({ key: 'Tab' }, store, {})).toBe(true)
    expect(store.addChildNode).toHaveBeenCalledWith('n1')
    const editing = useTextEditing(store, {})
    expect(editing.editingShapeId.value).toBe('nNEW')
    // The label is pre-selected, so the first keystroke replaces it rather than
    // appending to whatever the node was born with.
    expect(editing.session.selectAll).toBe(true)
  })

  it('Enter adds a sibling and puts the caret in it too', () => {
    const store = fakeStore()
    expect(mindmapKeydown({ key: 'Enter' }, store, {})).toBe(true)
    expect(store.addSiblingNode).toHaveBeenCalledWith('n1')
    expect(useTextEditing(store, {}).editingShapeId.value).toBe('nNEW')
  })

  // beginTextEdit selects the shape, but only selectNode drops a selected
  // cross-link — leaving one behind would give Delete two plausible targets.
  it('clears a selected cross-link when the new node takes the selection', () => {
    const store = fakeStore()
    mindmapUi.selectedCrosslinkId = 'x1'
    mindmapKeydown({ key: 'Tab' }, store, {})
    expect(mindmapUi.selectedCrosslinkId).toBeNull()
  })

  it('Shift+Tab does not add a child', () => {
    const store = fakeStore()
    mindmapKeydown({ key: 'Tab', shiftKey: true }, store, {})
    expect(store.addChildNode).not.toHaveBeenCalled()
  })

  it('does not grow the map when more than one node is selected', () => {
    const store = fakeStore()
    store.state.selection = ['n1', 'n2']
    store.state.shapes = [mmShape, { ...mmShape, id: 'n2' }]
    mindmapKeydown({ key: 'Tab' }, store, {})
    expect(store.addChildNode).not.toHaveBeenCalled()
  })

  it('Delete removes the selected subtrees', () => {
    const store = fakeStore()
    expect(mindmapKeydown({ key: 'Delete' }, store, {})).toBe(true)
    expect(store.deleteMindmapSubtrees).toHaveBeenCalledWith(['n1'])
  })

  it('opens no editor when the add is refused', () => {
    const store = fakeStore()
    store.addChildNode = vi.fn(() => null)
    expect(mindmapKeydown({ key: 'Tab' }, store, {})).toBe(true)
    expect(useTextEditing(store, {}).editingShapeId.value).toBeNull()
  })
})
