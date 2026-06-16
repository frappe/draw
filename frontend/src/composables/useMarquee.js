// Click-drag marquee selection on empty canvas (spec §7.2). begin() starts a
// drag in logical units; rect tracks the live selection box for rendering inside
// the canvas <g>; on release the intersected shapes are selected. Shift adds to
// the existing selection rather than replacing it.
import { ref } from 'vue'
import { axisAlignedBBox, rectsIntersect } from '@/diagram/geometry.js'

const MIN_DRAG = 3

export function useMarquee(store) {
  const rect = ref(null)

  function begin({ toLogical, start, additive }) {
    runDrag(toLogical, (point) => updateRect(rect, start, point), () => finish(store, rect, additive))
  }

  return { rect, begin }
}

// Window-level pointer listeners converting each event to a logical point.
function runDrag(toLogical, onMove, onEnd) {
  function handleMove(event) {
    onMove(toLogical(event))
  }
  function handleUp() {
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', handleUp)
    onEnd()
  }
  window.addEventListener('pointermove', handleMove)
  window.addEventListener('pointerup', handleUp)
}

// Normalise the drag into a positive-size rect in logical units.
function updateRect(rect, start, point) {
  rect.value = {
    x: Math.min(start.x, point.x),
    y: Math.min(start.y, point.y),
    w: Math.abs(point.x - start.x),
    h: Math.abs(point.y - start.y),
  }
}

// On release, select every shape whose AABB intersects the marquee, then clear.
function finish(store, rect, additive) {
  const box = rect.value
  rect.value = null
  if (!box || box.w < MIN_DRAG || box.h < MIN_DRAG) return
  const ids = store.state.shapes
    .filter((shape) => rectsIntersect(box, axisAlignedBBox(shape)))
    .map((shape) => shape.id)
  if (ids.length) additive ? store.addToSelection(ids) : store.select(ids)
}
