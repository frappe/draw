import { describe, it, expect } from 'vitest'
import { createDiagramStore } from './useDiagramStore.js'
import { createDiagramDocument } from '@/diagram/schema.js'
import { flattenSubmodels, ROLE } from '@/diagram/freeFloating.js'
import { createFlowchart, addFlowchartNode } from '@/diagram/flowchartModel.js'
import { createMindMap, addChild } from '@/diagram/mindmapModel.js'

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
