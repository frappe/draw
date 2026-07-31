import { describe, it, expect } from 'vitest'
import { createDiagramStore } from './useDiagramStore.js'
import { createDiagramDocument, parseDiagramDocument } from '@/diagram/schema.js'
import { whiteboardObjectsInZOrder } from '@/diagram/whiteboardModel.js'

// #27: shapes and whiteboard objects stacked on separate scales, so an image
// inserted after a freehand drawing rendered underneath it and Arrange — which
// only ever touched shapes[] — could not move it past. Both pools now share one
// zIndex scale.

const unified = () => createDiagramStore(createDiagramDocument(undefined, 'unified'))

// The whole document in painting order, bottom→top, as ids.
const stack = (store) =>
  [
    ...store.state.shapes.map((shape) => ({ id: shape.id, zIndex: shape.zIndex })),
    ...whiteboardObjectsInZOrder(store.state.whiteboard).map((o) => ({
      id: o.id,
      zIndex: o.object.zIndex,
    })),
  ]
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((o) => o.id)

describe('document-wide stacking order', () => {
  it('puts a shape added after a stroke above it', () => {
    const store = unified()
    const strokeId = store.addStroke([{ x: 0, y: 0 }, { x: 50, y: 50 }])
    const imageId = store.addShape({ type: 'image', src: 'x', x: 0, y: 0, w: 40, h: 40 })

    expect(stack(store)).toEqual([strokeId, imageId])
  })

  it('puts a stroke drawn after a shape above it', () => {
    const store = unified()
    const imageId = store.addShape({ type: 'image', src: 'x', x: 0, y: 0, w: 40, h: 40 })
    const strokeId = store.addStroke([{ x: 0, y: 0 }, { x: 50, y: 50 }])

    expect(stack(store)).toEqual([imageId, strokeId])
  })

  it('moves a shape past whiteboard objects with the Arrange actions', () => {
    const store = unified()
    const imageId = store.addShape({ type: 'image', src: 'x', x: 0, y: 0, w: 40, h: 40 })
    const strokeId = store.addStroke([{ x: 0, y: 0 }, { x: 50, y: 50 }])
    const noteId = store.addStickyNote(0, 0)

    store.sendToBack([imageId])
    expect(stack(store)).toEqual([imageId, strokeId, noteId])

    store.bringForward([imageId])
    expect(stack(store)).toEqual([strokeId, imageId, noteId])

    store.bringToFront([imageId])
    expect(stack(store)).toEqual([strokeId, noteId, imageId])

    store.sendBackward([imageId])
    expect(stack(store)).toEqual([strokeId, imageId, noteId])
  })

  it('reorders a whiteboard object against a shape', () => {
    const store = unified()
    const strokeId = store.addStroke([{ x: 0, y: 0 }, { x: 50, y: 50 }])
    const imageId = store.addShape({ type: 'image', src: 'x', x: 0, y: 0, w: 40, h: 40 })

    store.bringToFront([strokeId])
    expect(stack(store)).toEqual([imageId, strokeId])
  })

  it('undoes a reorder as one step', () => {
    const store = unified()
    const strokeId = store.addStroke([{ x: 0, y: 0 }, { x: 50, y: 50 }])
    const imageId = store.addShape({ type: 'image', src: 'x', x: 0, y: 0, w: 40, h: 40 })

    store.sendToBack([imageId])
    store.undo()

    expect(stack(store)).toEqual([strokeId, imageId])
  })

  it('keeps a legacy board rendering in its old fixed order', () => {
    // Saved before whiteboard objects carried a zIndex: the board painted shapes,
    // then strokes, then lines, then tables, then stickies.
    const document = parseDiagramDocument({
      canvas: { width: 1280, height: 720 },
      diagramType: 'whiteboard',
      shapes: [{ id: 'img1', type: 'image', x: 0, y: 0, w: 10, h: 10, zIndex: 1 }],
      connectors: [],
      whiteboard: {
        strokes: [{ id: 'w1', points: [], color: '#000', width: 3, kind: 'pen' }],
        lines: [{ id: 'wl1', x1: 0, y1: 0, x2: 1, y2: 1 }],
        tables: [{ id: 'wt1', x: 0, y: 0, rows: 1, cols: 1, cellW: 10, cellH: 10, cells: {} }],
        stickyNotes: [{ id: 'sn1', x: 0, y: 0, w: 10, h: 10, text: '' }],
      },
    })
    const store = createDiagramStore(document)

    expect(stack(store)).toEqual(['img1', 'w1', 'wl1', 'wt1', 'sn1'])
  })

  it('stacks an object added to a legacy board on top of it', () => {
    const document = parseDiagramDocument({
      canvas: { width: 1280, height: 720 },
      diagramType: 'whiteboard',
      shapes: [],
      connectors: [],
      whiteboard: {
        strokes: [{ id: 'w1', points: [], color: '#000', width: 3, kind: 'pen' }],
        stickyNotes: [{ id: 'sn1', x: 0, y: 0, w: 10, h: 10, text: '' }],
      },
    })
    const store = createDiagramStore(document)
    const imageId = store.addShape({ type: 'image', src: 'x', x: 0, y: 0, w: 40, h: 40 })

    expect(stack(store)).toEqual(['w1', 'sn1', imageId])
  })
})
