// Shrink-to-fit text inside a shape (spec 6.4). When a shape's text.autoFit is
// on, the rendered text is scaled DOWN from its base font size until it fits the
// box (height first, then width), never below a floor. Growing past the base
// size is intentionally not done here — base size is the ceiling.
//
// Driven from ShapeView: pass the inner text element ref and a getter for the
// fit inputs. We re-measure whenever the box, content, or base size changes.

import { watch, nextTick, onBeforeUnmount } from 'vue'

const MIN_SIZE = 8

export function useAutoFitText(elRef, getInputs) {
  let frame = 0

  function measureAndFit() {
    const el = elRef.value
    const { enabled, base } = getInputs()
    if (!el) return
    // Disabled → hand the size back to the base style and stop.
    if (!enabled) {
      el.style.fontSize = ''
      return
    }
    let size = base
    el.style.fontSize = `${size}px`
    // Step down until the content stops overflowing, or we hit the floor.
    let guard = 0
    while (size > MIN_SIZE && overflowing(el) && guard < 60) {
      size -= 1
      el.style.fontSize = `${size}px`
      guard += 1
    }
  }

  function schedule() {
    cancelAnimationFrame(frame)
    // Wait for the new content/box to lay out before measuring.
    nextTick(() => {
      frame = requestAnimationFrame(measureAndFit)
    })
  }

  watch(getInputs, schedule, { deep: true, immediate: true })
  onBeforeUnmount(() => cancelAnimationFrame(frame))

  return { refit: schedule }
}

// True when the element's content exceeds its box in either axis (a 1px slack
// avoids thrashing on sub-pixel rounding).
function overflowing(el) {
  return el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1
}
