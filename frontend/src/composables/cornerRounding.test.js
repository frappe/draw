// @vitest-environment jsdom
//
// jsdom so the rounding drag's window pointer listeners can be exercised with real
// events, the way useMarquee.test.js does.
import { describe, it, expect } from 'vitest'
import { createDiagramStore } from '@/stores/useDiagramStore.js'
import { useShapeTransform } from './useShapeTransform.js'
import { cornerRadiusOf, maxCornerRadius } from '@/diagram/shapeGeometry.js'

// #451 items 6/7: the corner dot. The radius has to follow the pointer while the
// drag runs, land as ONE undoable step, and never exceed what the box can draw.

// The layer converts client coordinates to logical ones; the gesture only cares
// that a point comes back, so the identity is enough here.
const toLogical = (event) => ({ x: event.clientX, y: event.clientY })

function drag(store, id, to) {
  useShapeTransform(store).startCornerRadius({ toLogical, id })
  window.dispatchEvent(new window.PointerEvent('pointermove', { clientX: to.x, clientY: to.y }))
  return () =>
    window.dispatchEvent(new window.PointerEvent('pointerup', { clientX: to.x, clientY: to.y }))
}

function boxStore() {
  const store = createDiagramStore()
  const id = store.addShape({ type: 'rectangle', x: 100, y: 100, w: 200, h: 120 })
  return { store, id }
}

describe('dragging the corner dot', () => {
  it('rounds the corner while the pointer moves, before release', () => {
    const { store, id } = boxStore()

    const release = drag(store, id, { x: 130, y: 130 })
    expect(store.shapeById(id).cornerRadius).toBe(30)
    release()
  })

  it('squares the corner off again when dragged back', () => {
    const { store, id } = boxStore()

    drag(store, id, { x: 100, y: 100 })()
    expect(cornerRadiusOf(store.shapeById(id))).toBe(0)
  })

  it('never exceeds half the shorter side, however far the pointer goes', () => {
    const { store, id } = boxStore()

    drag(store, id, { x: 5000, y: 5000 })()
    const shape = store.shapeById(id)
    expect(shape.cornerRadius).toBe(maxCornerRadius(shape))
    expect(shape.cornerRadius).toBe(60) // h 120 / 2
  })

  it('commits a drag of many moves as ONE undo step', () => {
    const { store, id } = boxStore()
    const before = cornerRadiusOf(store.shapeById(id))

    useShapeTransform(store).startCornerRadius({ toLogical, id })
    for (const at of [110, 130, 140, 150]) {
      window.dispatchEvent(new window.PointerEvent('pointermove', { clientX: at, clientY: at }))
    }
    window.dispatchEvent(new window.PointerEvent('pointerup', { clientX: 150, clientY: 150 }))

    expect(store.shapeById(id).cornerRadius).toBe(50)
    // One undo returns the shape to square, not to an intermediate radius.
    store.undo()
    expect(cornerRadiusOf(store.shapeById(id))).toBe(before)
  })

  it('leaves no history step when the dot is pressed and released in place', () => {
    const { store, id } = boxStore()

    useShapeTransform(store).startCornerRadius({ toLogical, id })
    window.dispatchEvent(new window.PointerEvent('pointerup', { clientX: 100, clientY: 100 }))

    // The gesture changed nothing, so it must not have taken a history step of its
    // own: the next undo belongs to whatever came before it, here the insert.
    store.undo()
    expect(store.state.shapes).toHaveLength(0)
    expect(id).toBeTruthy()
  })

  it('drops the listeners when the gesture is cancelled', () => {
    const { store, id } = boxStore()

    useShapeTransform(store).startCornerRadius({ toLogical, id })
    window.dispatchEvent(new window.PointerEvent('pointercancel', { clientX: 120, clientY: 120 }))
    const afterCancel = store.shapeById(id).cornerRadius
    window.dispatchEvent(new window.PointerEvent('pointermove', { clientX: 180, clientY: 180 }))

    expect(store.shapeById(id).cornerRadius).toBe(afterCancel)
  })

  it('ignores a shape that is no longer there', () => {
    const store = createDiagramStore()
    expect(() =>
      useShapeTransform(store).startCornerRadius({ toLogical, id: 'gone' }),
    ).not.toThrow()
  })
})
