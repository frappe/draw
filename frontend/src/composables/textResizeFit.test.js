// @vitest-environment jsdom
//
// jsdom because a resize gesture runs on window pointer events.
import { describe, it, expect } from 'vitest'
import { createDiagramStore } from '@/stores/useDiagramStore.js'
import { useShapeTransform } from '@/composables/useShapeTransform.js'
import { canvasTextShape, fitsWidthToText } from '@/composables/useTextEditing.js'

// #414 item 6: a text element hugs its content by default, but a box the user sized
// by hand keeps that size. `text.fitWidth` was set when the element was created and
// never cleared, so the next keystroke measured the text and threw the chosen size
// away.

function resizeTo(store, id, { x, y }) {
  const transform = useShapeTransform(store)
  transform.startResize({ toLogical: () => ({ x, y }), handle: 'bottom-right', id })
  window.dispatchEvent(new Event('pointermove'))
  window.dispatchEvent(new Event('pointerup'))
}

describe('resizing a canvas text element by hand', () => {
  it('stops it hugging the text', () => {
    const store = createDiagramStore()
    const id = store.addShape(canvasTextShape({ x: 100, y: 100 }, { size: 16 }))
    expect(fitsWidthToText(store.shapeById(id)), 'a fresh text element hugs').toBe(true)

    resizeTo(store, id, { x: 400, y: 300 })

    const shape = store.shapeById(id)
    expect(fitsWidthToText(shape), 'the hand-set size would be thrown away on the next edit').toBe(false)
    expect(shape.w).toBeGreaterThan(200)
  })

  it('leaves the text of an ordinary shape alone', () => {
    const store = createDiagramStore()
    const id = store.addShape({ type: 'rectangle', x: 0, y: 0, w: 100, h: 50, text: { content: 'hi' } })

    resizeTo(store, id, { x: 300, y: 200 })

    expect(store.shapeById(id).text).toEqual({ content: 'hi' })
  })

  it('keeps hugging when a handle is pressed but not dragged', () => {
    // Pressing a handle and letting go is not the user choosing a size. Releasing
    // the hug there would also register as a change and cost an undo step.
    const store = createDiagramStore()
    const id = store.addShape(canvasTextShape({ x: 100, y: 100 }, { size: 16 }))
    const { x, y, w, h } = store.shapeById(id)

    // Release the handle exactly where it was: the corner it already sits on.
    resizeTo(store, id, { x: x + w, y: y + h })

    expect(fitsWidthToText(store.shapeById(id))).toBe(true)
    // One undo takes the element back out: the gesture that changed nothing left
    // no step of its own to spend first.
    store.undo()
    expect(store.shapeById(id)).toBeFalsy()
  })

  it('undo restores the hug together with the size', () => {
    const store = createDiagramStore()
    const id = store.addShape(canvasTextShape({ x: 100, y: 100 }, { size: 16 }))
    const before = { ...store.shapeById(id) }

    resizeTo(store, id, { x: 400, y: 300 })
    store.undo()

    const shape = store.shapeById(id)
    expect(fitsWidthToText(shape)).toBe(true)
    expect(shape.w).toBe(before.w)
  })
})
