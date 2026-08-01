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
