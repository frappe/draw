import { describe, it, expect, beforeEach } from 'vitest'
import { createDiagramStore } from './useDiagramStore.js'
import { createDiagramDocument } from '@/diagram/schema.js'
import { mindmapUi, selectNode, selectCrosslink, toggleFocus } from './mindmapUi.js'
import { linkNodes } from '@/diagram/mindmapOperations.js'
import { mindmapKeydown } from '@/composables/useMindmapKeys.js'

// Cross-link selection + focus mode: both existed in the model but had no way to
// be reached from the UI. These cover the wiring, especially the rule that a node
// and a cross-link are never both the live Delete target.

// A mind-map document starts empty (no root until the user adds one), so seed a
// root and two children the way the overlay's "add first idea" flow does.
function mindmapStore() {
  const store = createDiagramStore(createDiagramDocument(undefined, 'mindmap'))
  const root = store.addRootNode('Root')
  const a = store.addChildNode(root)
  const b = store.addChildNode(root)
  return { store, root, a, b }
}

// mindmapUi is a module singleton, so each test starts from a known slate.
beforeEach(() => {
  mindmapUi.editingId = null
  mindmapUi.focusId = null
  mindmapUi.pendingLinkSource = null
  mindmapUi.confirmDelete = null
  mindmapUi.selectedCrosslinkId = null
})

describe('cross-link selection', () => {
  it('is mutually exclusive with node selection', () => {
    const { store, a } = mindmapStore()
    selectCrosslink('link-1')
    expect(mindmapUi.selectedCrosslinkId).toBe('link-1')

    // Selecting a node must drop the link selection, or Delete has two targets.
    selectNode(store, a)
    expect(mindmapUi.selectedCrosslinkId).toBeNull()
  })

  it('Delete removes the selected cross-link and leaves the nodes alone', () => {
    const { store, a, b } = mindmapStore()
    const linkId = linkNodes(store, a, b)
    expect(store.state.mindmap.crosslinks).toHaveLength(1)

    selectNode(store, null) // no node selected
    selectCrosslink(linkId)
    const consumed = mindmapKeydown({ key: 'Delete' }, store)

    expect(consumed).toBe(true)
    expect(store.state.mindmap.crosslinks).toHaveLength(0)
    expect(mindmapUi.selectedCrosslinkId).toBeNull()
    // The endpoints survive — deleting a link is not deleting nodes.
    expect(store.state.mindmap.nodes.some((n) => n.id === a)).toBe(true)
    expect(store.state.mindmap.nodes.some((n) => n.id === b)).toBe(true)
  })

  it('lets a node delete win when a node is also selected', () => {
    const { store, a, b } = mindmapStore()
    const linkId = linkNodes(store, a, b)
    // Contrived: a link selected AND a node selected (reachable via an additive click).
    mindmapUi.selectedCrosslinkId = linkId
    store.select([a])

    mindmapKeydown({ key: 'Delete' }, store)

    // The node went (a leaf, so no confirm dialog) rather than just the link.
    expect(store.state.mindmap.nodes.some((n) => n.id === a)).toBe(false)
    expect(store.state.mindmap.nodes.some((n) => n.id === b)).toBe(true)
    // deleteSubtree prunes cross-links touching a removed node, so no dangling
    // link is left behind, and the stale selection is dropped with it.
    expect(store.state.mindmap.crosslinks).toHaveLength(0)
    expect(mindmapUi.selectedCrosslinkId).toBeNull()
  })

  it('removing a cross-link is one undo step', () => {
    const { store, a, b } = mindmapStore()
    const linkId = linkNodes(store, a, b)
    selectNode(store, null)
    selectCrosslink(linkId)
    mindmapKeydown({ key: 'Delete' }, store)
    expect(store.state.mindmap.crosslinks).toHaveLength(0)

    store.undo()
    expect(store.state.mindmap.crosslinks).toHaveLength(1)
  })
})

describe('focus mode', () => {
  it('focuses the selected node and toggles back off', () => {
    const { store, a } = mindmapStore()
    selectNode(store, a)

    toggleFocus(store)
    expect(mindmapUi.focusId).toBe(a)

    toggleFocus(store)
    expect(mindmapUi.focusId).toBeNull()
  })

  it('always turns off regardless of what is selected, so it is never a trap', () => {
    const { store, a, b } = mindmapStore()
    selectNode(store, a)
    toggleFocus(store)
    expect(mindmapUi.focusId).toBe(a)

    // Selection moved elsewhere while focused — toggling still exits.
    selectNode(store, b)
    toggleFocus(store)
    expect(mindmapUi.focusId).toBeNull()
  })

  it('is a no-op when nothing is selected', () => {
    const { store } = mindmapStore()
    selectNode(store, null)
    toggleFocus(store)
    expect(mindmapUi.focusId).toBeNull()
  })
})
