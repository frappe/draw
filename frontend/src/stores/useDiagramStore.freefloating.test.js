import { describe, it, expect } from 'vitest'
import { createDiagramStore } from './useDiagramStore.js'
import { createDiagramDocument } from '@/diagram/schema.js'
import { flattenSubmodels, ROLE } from '@/diagram/freeFloating.js'
import { createFlowchart, addFlowchartNode } from '@/diagram/flowchartModel.js'

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
