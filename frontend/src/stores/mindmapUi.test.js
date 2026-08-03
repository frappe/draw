import { describe, it, expect, beforeEach } from 'vitest'
import { createDiagramStore } from './useDiagramStore.js'
import { createDiagramDocument } from '@/diagram/schema.js'
import {
  mindmapUi,
  selectNode,
  selectCrosslink,
  toggleFocus,
  focusedNodeId,
  resetMindmapUi,
} from './mindmapUi.js'
import { linkNodes, deleteNodes, deleteTrees } from '@/diagram/mindmapOperations.js'
import { rootNodes, createEmptyMindMap, addTree } from '@/diagram/mindmapModel.js'
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

// mindmapUi is a module singleton, so each test starts from a known slate — using
// the same reset the editor applies at each document boundary.
beforeEach(resetMindmapUi)

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

// focusId can outlive the node it names. subtreeIds() returns [id] for an unknown
// id, so an unguarded stale focus would produce a "focused subtree" containing
// nothing real — and dim EVERY remaining node while the banner claimed a focus.
describe('focusedNodeId guards a stale focus', () => {
  it('reports the focused node while it exists', () => {
    const { store, a } = mindmapStore()
    selectNode(store, a)
    toggleFocus(store)
    expect(focusedNodeId(store.state.mindmap)).toBe(a)
  })

  it('reports null once the focused node is deleted', () => {
    const { store, a } = mindmapStore()
    selectNode(store, a)
    toggleFocus(store)
    expect(focusedNodeId(store.state.mindmap)).toBe(a)

    deleteNodes(store, [a])

    // The raw flag still points at the dead node...
    expect(mindmapUi.focusId).toBe(a)
    // ...but every consumer reads through the guard, so focus is inert.
    expect(focusedNodeId(store.state.mindmap)).toBeNull()
  })

  it('reports null after undo removes the focused node again', () => {
    const { store, root } = mindmapStore()
    const c = store.addChildNode(root)
    selectNode(store, c)
    toggleFocus(store)
    store.undo() // undoes the node creation, so focusId names a node that is gone
    expect(focusedNodeId(store.state.mindmap)).toBeNull()
  })

  it('reports null for a missing or empty model (document switch)', () => {
    mindmapUi.focusId = 'some-node'
    expect(focusedNodeId(null)).toBeNull()
    expect(focusedNodeId(undefined)).toBeNull()
    expect(focusedNodeId({ nodes: [] })).toBeNull()
  })

  it('stays null when focus was never turned on', () => {
    const { store } = mindmapStore()
    expect(focusedNodeId(store.state.mindmap)).toBeNull()
  })

  // The existence guard is not enough on its own. Node ids come from a per-session
  // counter, so two documents created in different sessions both hold ids like 'm2'
  // — and a focus left behind in one map then passes the guard against an unrelated
  // node of the same id in the next. Hence the document-boundary reset.
  it('does not re-attach to a same-id node in a different document', () => {
    const first = mindmapStore()
    selectNode(first.store, first.a)
    toggleFocus(first.store)
    const leaked = mindmapUi.focusId

    // A different document that happens to contain that id (as a persisted one would).
    const otherDoc = createDiagramDocument(undefined, 'mindmap')
    otherDoc.mindmap = {
      rootId: leaked,
      nodes: [{ id: leaked, parentId: null, text: 'Unrelated node', depth: 0 }],
      crosslinks: [],
      layout: 'balanced',
      origin: { x: 0, y: 0 },
    }
    const second = createDiagramStore(otherDoc)

    // Left alone, the stale id passes the existence guard and focuses a stranger.
    expect(focusedNodeId(second.state.mindmap)).toBe(leaked)
    // Clearing the chrome as each document loads is what actually prevents it.
    resetMindmapUi()
    expect(focusedNodeId(second.state.mindmap)).toBeNull()
  })

  it('lets the next toggle focus immediately rather than spending a click on stale state', () => {
    const { store, a, b } = mindmapStore()
    selectNode(store, a)
    toggleFocus(store)
    deleteNodes(store, [a]) // focusId now names a node that is gone

    // The UI shows "not focused", so one click must actually focus — if toggleFocus
    // read the raw flag it would only clear it, and the user would need a 2nd click.
    selectNode(store, b)
    toggleFocus(store)
    expect(focusedNodeId(store.state.mindmap)).toBe(b)
  })
})

// #48: a unified canvas can hold several independent mind maps in one model, so
// Delete on a root has to remove THAT map — while a lone map still clears back to
// the blank "add your first idea" state, as it always did.
describe('deleting one of several mind maps', () => {
  // Seed two independent legacy sub-model trees DIRECTLY. The palette insert no
  // longer populates state.mindmap (free-floating #122) — it drops free-floating
  // shapes instead — but the multi-map delete path exercised below still operates
  // on the sub-model, so build one straight from the model helpers (behaviourally
  // identical to what the old insert seeded: one empty root per tree at origin 0,0).
  function unifiedWithTwoMaps() {
    const doc = createDiagramDocument(undefined, 'unified')
    doc.mindmap = createEmptyMindMap()
    addTree(doc.mindmap, '')
    addTree(doc.mindmap, '')
    const store = createDiagramStore(doc)
    const [first, second] = rootNodes(store.state.mindmap).map((n) => n.id)
    return { store, first, second }
  }

  it('Delete on a root asks to remove that map alone', () => {
    const { store, first, second } = unifiedWithTwoMaps()
    selectNode(store, second)

    expect(mindmapKeydown({ key: 'Delete' }, store)).toBe(true)
    expect(mindmapUi.confirmDelete.trees).toEqual([second])
    expect(mindmapUi.confirmDelete.clearAll).toBeUndefined()

    deleteTrees(store, mindmapUi.confirmDelete.trees)
    expect(rootNodes(store.state.mindmap).map((n) => n.id)).toEqual([first])
    expect(store.state.mindmap.nodes).toHaveLength(1) // one map remains, a single-node starter (#80)
  })

  it('still clears the whole map when it holds only one', () => {
    const doc = createDiagramDocument(undefined, 'unified')
    doc.mindmap = createEmptyMindMap()
    addTree(doc.mindmap, '')
    const store = createDiagramStore(doc)
    selectNode(store, store.state.mindmap.rootId)

    expect(mindmapKeydown({ key: 'Delete' }, store)).toBe(true)
    expect(mindmapUi.confirmDelete.clearAll).toBe(true)
  })
})
