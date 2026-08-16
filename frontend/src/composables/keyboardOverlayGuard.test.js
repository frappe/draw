// @vitest-environment jsdom
//
// jsdom because the guard is a DOM query. Asserting it by reading the source would
// pass just as happily on a selector that matches nothing.
import { describe, it, expect, afterEach, vi } from 'vitest'

vi.mock('frappe-ui', () => ({ call: () => Promise.resolve({}), toast: { error() {}, success() {} } }))

const { overlayOwnsTheKeyboard } = await import('./useKeyboard.js')

// The markup reka actually renders, from DialogContentImpl and PopoverContentImpl:
// role="dialog" plus a data-state that flips between open and closed.
function render(html) {
  document.body.innerHTML = html
}

afterEach(() => {
  document.body.innerHTML = ''
})

// #463: the editor's window keydown handler ran while a dialog was open, and it
// called preventDefault() on Escape. reka's DismissableLayer, bound to the same
// window and registered later, then saw defaultPrevented and declined to dismiss —
// so Escape could not close Export, Share or Show info. It was being spent
// deselecting the canvas behind them.
describe('the canvas keyboard stands down while an overlay is open (#463)', () => {
  it('is quiet on a bare canvas', () => {
    expect(overlayOwnsTheKeyboard()).toBe(false)
  })

  it('recognises an open dialog', () => {
    render('<div role="dialog" data-state="open">Export</div>')
    expect(overlayOwnsTheKeyboard()).toBe(true)
  })

  // A popover renders the same two attributes, which is why one guard covers the
  // toolbar menus as well — Zoom, Guides, Shapes and the rest could not close on
  // Escape for exactly the same reason.
  it('recognises an open toolbar popover', () => {
    render('<div role="dialog" data-state="open">Shapes</div>')
    expect(overlayOwnsTheKeyboard()).toBe(true)
  })

  it('lets go again once the layer closes', () => {
    render('<div role="dialog" data-state="closed">Export</div>')
    expect(overlayOwnsTheKeyboard()).toBe(false)
  })

  // The trigger carries data-state too, and is on screen the whole time. Matching it
  // would leave the canvas keyboard permanently dead — the worst failure this guard
  // could have, and a silent one.
  it('ignores the trigger, which carries data-state but no role', () => {
    render('<button data-state="open">Export…</button>')
    expect(overlayOwnsTheKeyboard()).toBe(false)
  })

  // A tooltip is not a layer that owns anything, and one is open whenever the
  // pointer rests on a toolbar button.
  it('ignores a tooltip', () => {
    render('<div role="tooltip" data-state="open">Export</div>')
    expect(overlayOwnsTheKeyboard()).toBe(false)
  })
})
