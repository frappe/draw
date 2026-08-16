// @vitest-environment jsdom
//
// jsdom so the marquee's window pointer listeners can be exercised with real events.
import { describe, it, expect, vi } from 'vitest'
import { useMarquee } from './useMarquee.js'

// Regression test for the pointercancel teardown (finding B5/E4). The marquee adds
// window pointermove/up listeners for the drag; before the fix they were removed
// only on pointerup, so a pointercancel — which the browser fires routinely on
// touch/pen when it claims the gesture (a scroll/zoom) — leaked both listeners and
// left the live selection box on screen. The other shared drag helpers
// (pointer.js, useShapeTransform, useWhiteboardInteraction) got the same fix.

function makeStore() {
  return {
    state: { shapes: [], connectors: [] },
    expandGroups: (ids) => ids,
    addToSelection: vi.fn(),
    select: vi.fn(),
    shapeById: () => undefined,
  }
}

// A MouseEvent carries clientX/clientY and dispatches to 'pointermove' listeners in
// jsdom, which lacks a PointerEvent constructor.
function move(x, y) {
  window.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y }))
}

function begin(store) {
  const marquee = useMarquee(store)
  marquee.begin({ toLogical: (e) => ({ x: e.clientX, y: e.clientY }), start: { x: 0, y: 0 }, additive: false })
  return marquee
}

describe('useMarquee pointercancel teardown', () => {
  it('clears the box and detaches every listener on pointercancel', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const { rect } = begin(makeStore())

    move(50, 50)
    expect(rect.value, 'the live box should track the drag').not.toBeNull()

    window.dispatchEvent(new Event('pointercancel'))

    expect(rect.value, 'a cancelled marquee must not strand its box').toBeNull()
    for (const type of ['pointermove', 'pointerup', 'pointercancel']) {
      expect(remove, `listener ${type} not removed on cancel`).toHaveBeenCalledWith(type, expect.any(Function))
    }
  })

  it('leaks no listener: a stray move after cancel no longer resurrects the box', () => {
    const { rect } = begin(makeStore())
    window.dispatchEvent(new Event('pointercancel'))

    move(99, 99) // if the move listener had leaked, this would rebuild the box

    expect(rect.value).toBeNull()
  })
})

// #506 / #512: the same function failing in both directions. It missed the
// whiteboard's own objects entirely — on the unified canvas the select tool does
// not delegate to the whiteboard layer, so THIS is the marquee that runs and it
// never read state.whiteboard — and it caught derived connectors that nothing can
// act on. Both are the filter in finish().
describe('what a drag box selects', () => {
  const shape = (id, x, y) => ({ id, type: 'rectangle', x, y, w: 40, h: 40 })

  function boardStore() {
    const store = {
      state: {
        shapes: [shape('s1', 10, 10), shape('s2', 900, 900)],
        connectors: [
          // Authored by the user: selectable.
          { id: 'c1', from: { x: 20, y: 20 }, to: { x: 60, y: 60 } },
          // Derived from a node tree: rebuilt on every load, so nothing can delete
          // one. It must never enter a selection.
          { id: 'mmb-a-b', role: 'mindmap-branch', from: { x: 20, y: 20 }, to: { x: 60, y: 60 } },
          { id: 'mmx-a-b', role: 'mindmap-crosslink', from: { x: 20, y: 20 }, to: { x: 60, y: 60 } },
          { id: 'fce-a-b', role: 'flowchart-edge', from: { x: 20, y: 20 }, to: { x: 60, y: 60 } },
        ],
        whiteboard: {
          strokes: [{ id: 'k1', width: 4, points: [{ x: 30, y: 30 }, { x: 80, y: 70 }] }],
          stickyNotes: [{ id: 'n1', x: 20, y: 20, w: 60, h: 60 }],
          lines: [{ id: 'l1', x1: 25, y1: 25, x2: 90, y2: 90 }],
          tables: [{ id: 't1', x: 15, y: 15, cellW: 40, cellH: 24, cells: [['a', 'b']] }],
          // Far outside the box below.
          ...{},
        },
      },
      expandGroups: (ids) => ids,
      addToSelection: vi.fn(),
      select: vi.fn(),
      clearSelection: vi.fn(),
      shapeById: (id) => store.state.shapes.find((s) => s.id === id),
    }
    return store
  }

  // Drag a box over the cluster near the origin and release.
  function dragOver(store, additive = false) {
    const marquee = useMarquee(store)
    marquee.begin({
      toLogical: (e) => ({ x: e.clientX, y: e.clientY }),
      start: { x: 0, y: 0 },
      additive,
    })
    move(200, 200)
    window.dispatchEvent(new Event('pointerup'))
    return marquee
  }

  it('takes the shapes and the authored connector, and no derived one', () => {
    const store = boardStore()
    dragOver(store)
    const ids = store.select.mock.calls[0][0]
    expect(ids).toContain('s1')
    expect(ids).toContain('c1')
    expect(ids).not.toContain('s2') // outside the box
    for (const derived of ['mmb-a-b', 'mmx-a-b', 'fce-a-b']) {
      expect(ids, `${derived} is derived and cannot be acted on`).not.toContain(derived)
    }
  })

  it('takes all four whiteboard kinds in the same box (#506)', async () => {
    const { useWhiteboardUi } = await import('./useWhiteboardUi.js')
    const store = boardStore()
    dragOver(store)
    const picked = useWhiteboardUi().state.selection
    expect(picked.map((item) => item.kind).sort()).toEqual(['line', 'sticky', 'stroke', 'table'])
  })

  // The point of the issue: one box, one selection, across both models. They
  // normally clear each other (#416).
  it('holds ink and shapes at once instead of one clearing the other', async () => {
    const { useWhiteboardUi } = await import('./useWhiteboardUi.js')
    const store = boardStore()
    dragOver(store)
    expect(store.select).toHaveBeenCalled()
    expect(useWhiteboardUi().state.selection.length).toBeGreaterThan(0)
    // keepShapes: the board selection must not have reached back and cleared the
    // shapes it was just paired with.
    expect(store.clearSelection).not.toHaveBeenCalled()
  })

  it('adds to both sides on a shift-drag', async () => {
    const { useWhiteboardUi } = await import('./useWhiteboardUi.js')
    useWhiteboardUi().setSelection([{ kind: 'sticky', id: 'existing' }], { keepShapes: true })
    const store = boardStore()
    dragOver(store, true)
    expect(store.addToSelection).toHaveBeenCalled()
    expect(store.select).not.toHaveBeenCalled()
    expect(useWhiteboardUi().state.selection.map((i) => i.id)).toContain('existing')
  })

  it('clears a stale board selection when a new box catches no ink', async () => {
    const { useWhiteboardUi } = await import('./useWhiteboardUi.js')
    useWhiteboardUi().setSelection([{ kind: 'sticky', id: 'stale' }], { keepShapes: true })
    const store = boardStore()
    store.state.whiteboard = null // a document with no board at all
    dragOver(store)
    expect(useWhiteboardUi().state.selection).toEqual([])
  })
})
