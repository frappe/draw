import { describe, it, expect } from 'vitest'
import { reactive, computed, watch, nextTick } from 'vue'
import { createDiagramStore } from './useDiagramStore.js'
import { createDiagramDocument } from '@/diagram/schema.js'

// Regression tests for #28: Ctrl+Z reset the canvas viewport before undoing.
//
// DiagramCanvas re-frames the view (openAtActualSize) when a document arrives
// after mount. It used to key that off the canvas dimensions, read through a
// single getter returning `[canvas.width, canvas.height]` — but history's
// restore() replaces `state.canvas` wholesale, so the getter yielded a fresh
// array on every undo and the view jumped back to the default. `loadCount` marks
// an actual document load, and the dimension sources are now separate getters.

describe('loadCount distinguishes a document load from an edit', () => {
  it('starts at 0 and increments once per loadDocument', () => {
    const store = createDiagramStore()
    expect(store.state.loadCount).toBe(0)

    store.loadDocument(createDiagramDocument())
    store.loadDocument(createDiagramDocument())
    expect(store.state.loadCount).toBe(2)
  })

  it('is not touched by edits, undo or redo', () => {
    const store = createDiagramStore()
    store.addShape({ x: 10, y: 10 })
    store.undo()
    store.redo()
    expect(store.state.loadCount).toBe(0)
  })

  it('is not part of the saved document', () => {
    const store = createDiagramStore()
    store.loadDocument(createDiagramDocument())
    expect(store.getDocument()).not.toHaveProperty('loadCount')
  })
})

describe('undo restores the canvas without looking like a resize', () => {
  it('leaves the dimensions equal, so a per-value watcher stays quiet', () => {
    const store = createDiagramStore()
    // Hold the live object, not a copy of it — the point is that undo swaps the
    // identity while keeping the values, which is what the old watcher tripped on.
    const original = store.state.canvas
    const dimensions = { width: original.width, height: original.height }
    store.addShape({ x: 10, y: 10 })
    store.undo()

    // restore() hands back a NEW canvas object; only the values must match.
    expect(store.state.canvas).not.toBe(original)
    expect(store.state.canvas.width).toBe(dimensions.width)
    expect(store.state.canvas.height).toBe(dimensions.height)
  })

  // Guards the watcher shape itself: one getter returning an array re-fires on
  // every object replacement, separate getters compare the values.
  it('a getter-per-source watcher ignores an equal-valued canvas replacement', async () => {
    const state = reactive({ canvas: { width: 1280, height: 720 }, loadCount: 0 })
    const canvas = computed(() => state.canvas)
    let fires = 0
    watch(
      [() => state.loadCount, () => canvas.value.width, () => canvas.value.height],
      () => fires++,
    )

    state.canvas = { width: 1280, height: 720 } // what history restore() does
    await nextTick()
    expect(fires).toBe(0)

    state.canvas = { width: 1600, height: 900 } // a real canvas-size change
    state.loadCount += 1 // a real document load
    await nextTick()
    expect(fires).toBe(1)
  })
})
