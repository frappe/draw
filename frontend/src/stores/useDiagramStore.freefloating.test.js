import { describe, it, expect, afterEach } from 'vitest'
import { createDiagramStore } from './useDiagramStore.js'
import { createDiagramDocument } from '@/diagram/schema.js'
import { flattenSubmodels, ROLE } from '@/diagram/freeFloating.js'
import { createFlowchart, addFlowchartNode } from '@/diagram/flowchartModel.js'
import { createMindMap, addChild } from '@/diagram/mindmapModel.js'
import { useAppSettings, resetSettings } from '@/composables/useAppSettings.js'

// A store whose flowchart has been flattened to free-floating tagged shapes (the
// #122 state: state.flowchart is null, the node lives in state.shapes as a
// role-tagged shape). Exercises the phase-3c store ops the keyboard drives.
function migratedFlowchartStore(nodeType = 'terminator') {
  const fc = createFlowchart()
  const startId = addFlowchartNode(fc, nodeType, 'Start', 100, 100)
  const doc = flattenSubmodels({ ...createDiagramDocument(undefined, 'unified'), flowchart: fc })
  return { store: createDiagramStore(doc), startId }
}

describe('store.addFlowchartChildShape (free-floating #122)', () => {
  it('adds a tagged child shape + edge connector bound to the parent', () => {
    const { store, startId } = migratedFlowchartStore()
    const newId = store.addFlowchartChildShape(startId, 'process')
    expect(newId).toBeTruthy()
    const added = store.state.shapes.find((s) => s.id === newId)
    expect(added.role).toBe(ROLE.flowchartNode)
    expect(added.flowchart.nodeType).toBe('process')
    expect(added.zIndex).toBeGreaterThan(0)
    const edge = store.state.connectors.find((c) => c.to?.shapeId === newId)
    expect(edge.role).toBe(ROLE.flowchartEdge)
    expect(edge.from.shapeId).toBe(startId)
  })

  it('is one undo step (shape + connector both revert)', () => {
    const { store, startId } = migratedFlowchartStore()
    const shapesBefore = store.state.shapes.length
    const connectorsBefore = store.state.connectors.length
    store.addFlowchartChildShape(startId, 'process')
    store.undo()
    expect(store.state.shapes.length).toBe(shapesBefore)
    expect(store.state.connectors.length).toBe(connectorsBefore)
  })

  it('returns null and adds nothing for a non-flowchart parent', () => {
    const { store } = migratedFlowchartStore()
    const before = store.state.shapes.length
    expect(store.addFlowchartChildShape('nope', 'process')).toBeNull()
    expect(store.state.shapes.length).toBe(before)
  })
})

// A store whose mind map has been flattened to free-floating tagged shapes: the
// root is a boxed shape, its child renders as text (mindmap.shaped false).
function migratedMindmapStore() {
  const mm = createMindMap('Root')
  const childId = addChild(mm, mm.rootId, 'Child', 'right')
  const doc = flattenSubmodels({ ...createDiagramDocument(undefined, 'unified'), mindmap: mm })
  return { store: createDiagramStore(doc), rootId: mm.rootId, childId }
}

describe('store.setMindmapNodeShaped (Whimsical #125)', () => {
  it('toggles a node between text and box, and undo restores it', () => {
    const { store, childId } = migratedMindmapStore()
    expect(store.shapeById(childId).mindmap.shaped).toBe(false) // children default to text
    store.setMindmapNodeShaped(childId, true)
    expect(store.shapeById(childId).mindmap.shaped).toBe(true)
    store.undo()
    expect(store.shapeById(childId).mindmap.shaped).toBe(false)
  })

  it('flips only shaped, leaving the rest of the node tag intact', () => {
    const { store, childId } = migratedMindmapStore()
    const before = { ...store.shapeById(childId).mindmap }
    store.setMindmapNodeShaped(childId, true)
    const after = store.shapeById(childId).mindmap
    expect(after.shaped).toBe(true)
    expect(after.parentId).toBe(before.parentId)
    expect(after.side).toBe(before.side)
    expect(after.depth).toBe(before.depth)
  })
})

// #126: addChildNode / addSiblingNode read the saved "Mind map child nodes" default
// and stamp it onto the new node's mindmap.shaped, without the pure builder knowing
// the setting (a sibling is another child node, so it honours the same default).
describe('store.addChildNode / addSiblingNode default child style (#126)', () => {
  afterEach(() => resetSettings())

  it('adds a boxed child when the default is Shape', () => {
    useAppSettings().settings.mindmapChildStyle = 'shape'
    const { store, rootId } = migratedMindmapStore()
    const newId = store.addChildNode(rootId)
    expect(store.shapeById(newId).mindmap.shaped).toBe(true)
  })

  it('adds a text child when the default is Text (unchanged behaviour)', () => {
    useAppSettings().settings.mindmapChildStyle = 'text'
    const { store, rootId } = migratedMindmapStore()
    const newId = store.addChildNode(rootId)
    expect(store.shapeById(newId).mindmap.shaped).toBe(false)
  })

  it('adds a boxed sibling when the default is Shape', () => {
    useAppSettings().settings.mindmapChildStyle = 'shape'
    const { store, childId } = migratedMindmapStore()
    const newId = store.addSiblingNode(childId)
    expect(store.shapeById(newId).mindmap.shaped).toBe(true)
  })

  it('adds a text sibling when the default is Text (unchanged behaviour)', () => {
    useAppSettings().settings.mindmapChildStyle = 'text'
    const { store, childId } = migratedMindmapStore()
    const newId = store.addSiblingNode(childId)
    expect(store.shapeById(newId).mindmap.shaped).toBe(false)
  })
})

describe('store.deleteFlowchartShapes (free-floating #122)', () => {
  it('drops the node and every edge touching it (no dangling)', () => {
    const { store, startId } = migratedFlowchartStore()
    const childId = store.addFlowchartChildShape(startId, 'process')
    store.deleteFlowchartShapes([childId])
    expect(store.state.shapes.find((s) => s.id === childId)).toBeFalsy()
    expect(store.state.shapes.find((s) => s.id === startId)).toBeTruthy() // upstream stays
    const dangling = store.state.connectors.some(
      (c) => c.from?.shapeId === childId || c.to?.shapeId === childId,
    )
    expect(dangling).toBe(false)
  })

  it('clears the deleted ids from the selection', () => {
    const { store, startId } = migratedFlowchartStore()
    store.select([startId])
    store.deleteFlowchartShapes([startId])
    expect(store.state.selection).not.toContain(startId)
  })

  it('ignores ids that are not flowchart shapes', () => {
    const { store } = migratedFlowchartStore()
    const before = store.state.shapes.length
    store.deleteFlowchartShapes(['nope'])
    expect(store.state.shapes.length).toBe(before)
  })
})

// #122 P3: an explicit whole-tree Tidy for a free-floating mind map — re-flows the
// selected node's tree pinned by its root, as one undoable unit.
describe('store.applyMindmapShapeLayout (free-floating #122 P3)', () => {
  it('re-flows the tree in ONE undoable commit (undo restores prior positions)', () => {
    const { store, rootId, childId } = migratedMindmapStore()
    // Shove the child far off; Tidy should pull it back beside the root.
    store.shapeById(childId).x = 9999
    store.shapeById(childId).y = 9999
    store.applyMindmapShapeLayout('Tidy up', rootId)
    expect(store.shapeById(childId).x).toBeLessThan(9999)
    // One commit: a single undo restores the shoved-away position.
    store.undo()
    expect(store.shapeById(childId).x).toBe(9999)
    expect(store.shapeById(childId).y).toBe(9999)
  })

  it('is a no-op when the canvas has no mind-map shapes', () => {
    const { store } = migratedFlowchartStore()
    const before = store.state.shapes.map((s) => ({ id: s.id, x: s.x, y: s.y }))
    store.applyMindmapShapeLayout('Tidy up', 'nope')
    expect(store.state.shapes.map((s) => ({ id: s.id, x: s.x, y: s.y }))).toEqual(before)
  })
})

// A migrated map whose root already carries `sides` children (in that order, each
// pinned to the named side), flattened to tagged shapes and re-flowed.
function migratedMindmapStoreWith(sides) {
  const mm = createMindMap('Root')
  const ids = sides.map((side, i) => addChild(mm, mm.rootId, `C${i}`, side))
  const doc = flattenSubmodels({ ...createDiagramDocument(undefined, 'unified'), mindmap: mm })
  const store = createDiagramStore(doc)
  return { store, rootId: mm.rootId, ids }
}

// The laid-out vertical centre of a shape (children stack top→bottom on their side).
const centreY = (store, id) => store.shapeById(id).y + store.shapeById(id).h / 2

// Gap insertion (#265): addChildNodeAt drops a child at a chosen ordinal on a side and
// re-flows the tree so the new node lands in that slot.
describe('store.addChildNodeAt (gap insertion #265)', () => {
  it('inserts BETWEEN two children on a side — the new node ends up vertically between them', () => {
    const { store, rootId, ids } = migratedMindmapStoreWith(['right', 'right', 'right'])
    const newId = store.addChildNodeAt(rootId, 'right', 1) // between C0 and C1
    expect(store.shapeById(newId).mindmap.parentId).toBe(rootId)
    expect(store.shapeById(newId).mindmap.side).toBe('right')
    // After the re-flow the new node sits between its two neighbours.
    expect(centreY(store, newId)).toBeGreaterThan(centreY(store, ids[0]))
    expect(centreY(store, newId)).toBeLessThan(centreY(store, ids[1]))
    // Ordinal 1: exactly one right child is above it, the rest below.
    const rightYs = [ids[0], ids[1], ids[2]].map((id) => centreY(store, id))
    const above = rightYs.filter((y) => y < centreY(store, newId)).length
    expect(above).toBe(1)
  })

  it('inserts ABOVE the top child at ordinal 0, and BELOW the last past the end', () => {
    const { store, rootId, ids } = migratedMindmapStoreWith(['right', 'right'])
    const topId = store.addChildNodeAt(rootId, 'right', 0)
    expect(centreY(store, topId)).toBeLessThan(centreY(store, ids[0]))
    const botId = store.addChildNodeAt(rootId, 'right', 99) // clamps to the end
    expect(centreY(store, botId)).toBeGreaterThan(centreY(store, ids[1]))
  })

  it('scopes the ordinal to the clicked side on a two-sided root', () => {
    const { store, rootId, ids } = migratedMindmapStoreWith(['right', 'left', 'right'])
    // ids[0], ids[2] are the two right children; ids[1] is the lone left child.
    const rootCentreX = store.shapeById(rootId).x + store.shapeById(rootId).w / 2
    const leftCentreBefore = centreY(store, ids[1])
    const newId = store.addChildNodeAt(rootId, 'right', 1) // between the two right children
    expect(store.shapeById(newId).mindmap.side).toBe('right')
    expect(centreY(store, newId)).toBeGreaterThan(centreY(store, ids[0]))
    expect(centreY(store, newId)).toBeLessThan(centreY(store, ids[2]))
    // The left branch keeps its side and slot — the insert only reshuffled the right
    // side, so the lone left child stays left of the root and barely moves (a re-flow
    // only re-rounds it, never reorders it).
    expect(store.shapeById(ids[1]).mindmap.side).toBe('left')
    expect(store.shapeById(ids[1]).x + store.shapeById(ids[1]).w / 2).toBeLessThan(rootCentreX)
    expect(Math.abs(centreY(store, ids[1]) - leftCentreBefore)).toBeLessThanOrEqual(1)
  })

  it('adds the first child at the same level (empty side) and selects the new node', () => {
    const { store, rootId } = migratedMindmapStoreWith([])
    const newId = store.addChildNodeAt(rootId, 'right', 0)
    expect(store.shapeById(newId)).toBeTruthy()
    expect(store.state.selection).toEqual([newId])
  })

  it('inserts + re-flows in ONE undoable commit', () => {
    const { store, rootId } = migratedMindmapStoreWith(['right', 'right'])
    const shapesBefore = store.state.shapes.length
    const newId = store.addChildNodeAt(rootId, 'right', 1)
    expect(store.state.shapes.length).toBe(shapesBefore + 1)
    store.undo()
    expect(store.state.shapes.length).toBe(shapesBefore)
    expect(store.shapeById(newId)).toBeFalsy()
  })

  it('returns null for a parent that is not a migrated mind-map shape', () => {
    const { store } = migratedFlowchartStore()
    const before = store.state.shapes.length
    expect(store.addChildNodeAt('nope', 'right', 0)).toBeNull()
    expect(store.state.shapes.length).toBe(before)
  })
})
