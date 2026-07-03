// Shared pointer/interaction plumbing reused by every diagram type's selection
// and marquee code (block/flowchart/mindmap/whiteboard). Kept in one place so the
// "add to selection" modifier, the client→logical transform and the rubber-band
// drag loop can't drift apart between types.

// Shift, Ctrl, or Cmd all act as the "add to selection" modifier.
export function isAdditiveEvent(event) {
  return event.shiftKey || event.ctrlKey || event.metaKey
}

// Convert a pointer event to logical canvas units: undo pan, then undo zoom,
// against a surface rect captured at drag start (so it stays correct after the
// surface scrolls away). `viewport` is the shared editor viewport (Part G4).
export function clientToLogical(event, rect, viewport) {
  const { panX, panY, zoom } = viewport.state
  return {
    x: (event.clientX - rect.left - panX) / zoom,
    y: (event.clientY - rect.top - panY) / zoom,
  }
}

// Window-level rubber-band drag: converts each move to logical units, hands the
// normalised (positive-size) box to onUpdate, and calls onDone on release.
// Callers own where the box is stored (their live-marquee state) and the release
// selection logic — this owns only the listener lifecycle + box math.
export function runMarqueeDrag({ start, rect, viewport, onUpdate, onDone }) {
  const move = (event) => {
    const point = clientToLogical(event, rect, viewport)
    onUpdate({
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      w: Math.abs(point.x - start.x),
      h: Math.abs(point.y - start.y),
    })
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    onDone()
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
