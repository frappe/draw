import { describe, it, expect } from 'vitest'
import { createDiagramStore } from './useDiagramStore.js'
import { createDiagramDocument } from '@/diagram/schema.js'
import { whiteboardObjectsInZOrder } from '@/diagram/whiteboardModel.js'

// #542: a connector had no stacking position at all — it always painted below
// every shape, in a dedicated leading loop, and Arrange never touched it (it
// wasn't in stackedObjects). Connectors now share the shapes/whiteboard zIndex
// scale, so Arrange can move a line above or below a shape — but a connector's
// default stays 0 (below every shape), so an existing document with no arranged
// connectors paints exactly as it always did.

const unified = () => createDiagramStore(createDiagramDocument(undefined, 'unified'))

const stack = (store) =>
  [
    ...store.state.shapes.map((shape) => ({ id: shape.id, zIndex: shape.zIndex })),
    ...store.state.connectors.map((connector) => ({ id: connector.id, zIndex: connector.zIndex })),
  ]
    .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
    .map((o) => o.id)

describe('a connector shares the document-wide stacking order (#542)', () => {
  it('paints below every shape by default, whatever order they were added in', () => {
    const store = unified()
    const shapeId = store.addShape({ type: 'rectangle', x: 0, y: 0, w: 40, h: 40 })
    const connectorId = store.addConnector({ from: { x: 0, y: 0 }, to: { x: 10, y: 10 } })

    expect(stack(store)).toEqual([connectorId, shapeId])
  })

  it('moves a connector past a shape with the Arrange actions', () => {
    const store = unified()
    const shapeA = store.addShape({ type: 'rectangle', x: 0, y: 0, w: 40, h: 40 })
    const connectorId = store.addConnector({ from: { x: 0, y: 0 }, to: { x: 10, y: 10 } })
    const shapeB = store.addShape({ type: 'rectangle', x: 0, y: 0, w: 40, h: 40 })

    store.bringToFront([connectorId])
    expect(stack(store)).toEqual([shapeA, shapeB, connectorId])

    store.sendToBack([connectorId])
    expect(stack(store)).toEqual([connectorId, shapeA, shapeB])

    store.bringForward([connectorId])
    expect(stack(store)).toEqual([shapeA, connectorId, shapeB])
  })

  it('undoes a connector reorder as one step', () => {
    const store = unified()
    const shapeId = store.addShape({ type: 'rectangle', x: 0, y: 0, w: 40, h: 40 })
    const connectorId = store.addConnector({ from: { x: 0, y: 0 }, to: { x: 10, y: 10 } })

    store.bringToFront([connectorId])
    store.undo()

    expect(stack(store)).toEqual([connectorId, shapeId])
  })

  it('leaves a structural connector out of Arrange — it has no stack position of its own', () => {
    // A migrated flowchart edge: role-tagged, both endpoints shape-attached.
    // Built by hand rather than through the free-floating migration so the test
    // stays about the ordering rule, not the migration itself.
    const document = createDiagramDocument(undefined, 'unified')
    document.shapes = [
      { id: 's1', type: 'rectangle', x: 0, y: 0, w: 40, h: 40, zIndex: 1 },
      { id: 's2', type: 'rectangle', x: 100, y: 0, w: 40, h: 40, zIndex: 2 },
    ]
    document.connectors = [
      {
        id: 'e1',
        type: 'elbow',
        role: 'flowchart-edge',
        from: { shapeId: 's1', anchor: 'right' },
        to: { shapeId: 's2', anchor: 'left' },
        arrowheads: { start: 'none', end: 'arrow' },
        style: { color: '#525252', width: 1.5, dash: 'solid' },
      },
    ]
    const store = createDiagramStore(document)

    store.bringToFront(['e1'])

    // Untouched: not in stackedObjects, so the reorder loop never assigns it a
    // score, and repack cannot move what it never saw.
    expect(store.connectorById('e1').zIndex).toBeUndefined()
    expect(store.shapeById('s1').zIndex).toBe(1)
    expect(store.shapeById('s2').zIndex).toBe(2)
  })
})

// nextZIndex used to read the SHAPE pool only, while repackZIndex renumbers
// shapes and connectors together. So once a connector had been arranged to the
// top it held the highest index in the document, the highest shape index sat one
// below it, and the next object created landed on that same index as the
// connector.
//
// A tie is worse than a plain wrong order: the two renderers break one in
// opposite directions — DiagramCanvas lists connectors before shapes,
// WhiteboardLayer lists shapes before connectors — so the same document stacked
// one way in block mode and the other on the unified canvas.
describe('a new object clears everything already stacked (#542)', () => {
  it('lands above an arranged connector rather than level with it', () => {
    const store = unified()
    const shapeA = store.addShape({ type: 'rectangle', x: 0, y: 0, w: 40, h: 40 })
    const connectorId = store.addConnector({ from: { x: 0, y: 0 }, to: { x: 10, y: 10 } })
    store.bringToFront([connectorId])

    const shapeB = store.addShape({ type: 'rectangle', x: 0, y: 0, w: 40, h: 40 })

    expect(store.shapeById(shapeB).zIndex).toBeGreaterThan(store.connectorById(connectorId).zIndex)
    expect(stack(store)).toEqual([shapeA, connectorId, shapeB])
  })

  it('counts an arranged connector when the new object is a whiteboard one', () => {
    const store = unified()
    store.addShape({ type: 'rectangle', x: 0, y: 0, w: 40, h: 40 })
    const connectorId = store.addConnector({ from: { x: 0, y: 0 }, to: { x: 10, y: 10 } })
    store.bringToFront([connectorId])

    const noteId = store.addStickyNote(0, 0)
    const note = whiteboardObjectsInZOrder(store.state.whiteboard).find((o) => o.id === noteId)

    expect(note.object.zIndex).toBeGreaterThan(store.connectorById(connectorId).zIndex)
  })
})
