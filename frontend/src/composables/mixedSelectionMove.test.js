// @vitest-environment jsdom
//
// jsdom so the move gesture's window pointer listeners can be driven with real
// events, the way cornerRounding.test.js does.
import { describe, it, expect, beforeEach } from 'vitest'
import { createDiagramStore } from '@/stores/useDiagramStore.js'
import { createDiagramDocument } from '@/diagram/schema.js'
import { useShapeTransform } from './useShapeTransform.js'
import { useWhiteboardUi } from './useWhiteboardUi.js'

// #506 made one box select the whiteboard's ink AND the block shapes at once.
// Dragging that selection then has to move both — a box the user drew round four
// things, half of which stay put, is worse than not selecting them at all.
//
// The two selections used to clear each other (#416), so this state was
// unreachable and neither drag path had any reason to know about the other.

const toLogical = (event) => ({ x: event.clientX, y: event.clientY })

function boardStore() {
  const document = {
    ...createDiagramDocument(undefined, 'unified'),
    whiteboard: {
      strokes: [{ id: 'k1', width: 4, points: [{ x: 300, y: 300 }, { x: 340, y: 340 }] }],
      stickyNotes: [{ id: 'n1', x: 400, y: 400, w: 80, h: 80, color: '#FFE' }],
      lines: [],
      tables: [],
    },
  }
  const store = createDiagramStore(document, 'doc-1')
  const shapeId = store.addShape({ type: 'rectangle', x: 100, y: 100, w: 60, h: 60 })
  return { store, shapeId }
}

// Select a shape and a stroke together, the way a marquee over both now does.
function selectBoth(store, shapeId) {
  store.select([shapeId])
  useWhiteboardUi(store).setSelection([{ kind: 'stroke', id: 'k1' }], { keepShapes: true })
}

const strokeStart = (store) => ({ ...store.state.whiteboard.strokes[0].points[0] })

function dragBy(store, shapeId, dx, dy) {
  useShapeTransform(store).startMove({ toLogical, start: { x: 0, y: 0 }, ids: [shapeId] })
  window.dispatchEvent(new window.PointerEvent('pointermove', { clientX: dx, clientY: dy }))
  window.dispatchEvent(new window.PointerEvent('pointerup', { clientX: dx, clientY: dy }))
}

describe('dragging a selection that holds both ink and shapes (#506)', () => {
  beforeEach(() => useWhiteboardUi().clearSelection())

  it('moves the stroke by the same delta as the shape', () => {
    const { store, shapeId } = boardStore()
    selectBoth(store, shapeId)
    const before = strokeStart(store)

    dragBy(store, shapeId, 40, 25)

    expect(store.shapeById(shapeId).x).toBe(140)
    expect(store.shapeById(shapeId).y).toBe(125)
    expect(strokeStart(store)).toEqual({ x: before.x + 40, y: before.y + 25 })
  })

  it('takes one undo for the whole drag, not one per half', () => {
    const { store, shapeId } = boardStore()
    selectBoth(store, shapeId)
    const before = strokeStart(store)

    dragBy(store, shapeId, 40, 25)
    store.undo()

    expect(store.shapeById(shapeId).x).toBe(100)
    expect(strokeStart(store)).toEqual(before)
  })

  it('leaves the board alone when no whiteboard object is selected', () => {
    const { store, shapeId } = boardStore()
    store.select([shapeId])
    const before = strokeStart(store)

    dragBy(store, shapeId, 40, 25)

    expect(store.shapeById(shapeId).x).toBe(140)
    expect(strokeStart(store)).toEqual(before)
  })

  it('does not commit a move for a click that never dragged', () => {
    const { store, shapeId } = boardStore()
    selectBoth(store, shapeId)
    const before = strokeStart(store)

    dragBy(store, shapeId, 1, 1) // under the drag threshold

    expect(store.shapeById(shapeId).x).toBe(100)
    expect(strokeStart(store)).toEqual(before)
  })
})
