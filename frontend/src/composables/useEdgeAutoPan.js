// Auto-pan the viewport while a drag (drawing a shape / sizing a section) reaches
// the edge of the canvas surface, so you can create content beyond the current
// view — the canvas scrolls to follow, Figma/Slides style. Pure pan: it nudges
// viewport.panX/panY each frame and re-applies the caller's draft with the last
// pointer, whose logical position extends outward as the pan moves.

const EDGE = 48 // px from an edge where auto-pan kicks in
const MAX_SPEED = 16 // px/frame at the very edge (ramps up with depth)

export function useEdgeAutoPan(viewport) {
  let raf = null
  let el = null
  let step = null
  let clientX = 0
  let clientY = 0

  // Signed pan velocity for one axis: negative near the low edge, positive near
  // the high edge, zero in the middle. Ramps linearly with how deep into the zone.
  function velocity(pos, size) {
    if (pos < EDGE) return -MAX_SPEED * Math.min(1, (EDGE - pos) / EDGE)
    if (pos > size - EDGE) return MAX_SPEED * Math.min(1, (pos - (size - EDGE)) / EDGE)
    return 0
  }

  // Arm for a drag: the surface element + a step(clientX, clientY) the caller uses
  // to re-apply its draft after each auto-pan frame.
  function begin(surfaceEl, onStep) {
    el = surfaceEl
    step = onStep
  }

  // Feed the latest pointer position (call on every pointermove during the drag).
  function track(x, y) {
    clientX = x
    clientY = y
    if (!raf) raf = requestAnimationFrame(loop)
  }

  function loop() {
    raf = null
    if (!el || !step) return
    const rect = el.getBoundingClientRect()
    const vx = velocity(clientX - rect.left, rect.width)
    const vy = velocity(clientY - rect.top, rect.height)
    if (!vx && !vy) return // out of the edge zone → idle (a later track() restarts)
    // Pan the content opposite the edge so the pointer reveals new canvas there.
    viewport.setPan(viewport.state.panX - vx, viewport.state.panY - vy)
    step(clientX, clientY)
    raf = requestAnimationFrame(loop)
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf)
    raf = null
    el = null
    step = null
  }

  return { begin, track, stop }
}
