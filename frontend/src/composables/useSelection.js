// Pointer-driven selection on the canvas surface (spec §7.2): click to select,
// Shift+click to add/remove, drag a hit shape to move, drag empty canvas to
// marquee, click empty to deselect. Exposes a logical-coordinate helper that
// other canvas interactions reuse. Integration attaches onSurfacePointerdown to
// the canvas surface (the wrapper carrying the viewport transform).
import { pointInShape } from '@/diagram/geometry.js'
import { isInteractable } from '@/diagram/shapeFlags.js'
import { useShapeTransform } from '@/composables/useShapeTransform.js'
import { useMarquee } from '@/composables/useMarquee.js'
import { isAdditiveEvent } from '@/composables/pointer.js'

export function useSelection(store, editorUi) {
  const transform = useShapeTransform(store, editorUi)
  const marquee = useMarquee(store)

  function onSurfacePointerdown(event) {
    if (editorUi.state.tool !== 'select' || event.button !== 0) return
    const toLogical = makeConverter(event.currentTarget, editorUi.viewport)
    const start = toLogical(event)
    const shape = topShapeAt(store, start)
    if (shape) selectAndMove(store, transform, shape, event, toLogical, start)
    else beginMarquee(store, marquee, event, toLogical, start)
  }

  return { onSurfacePointerdown, transform, marquee, toLogicalFor }
}

// Build a client→logical converter closed over the surface element + viewport.
// The surface doesn't move or scroll mid-gesture, so reading its rect/scroll live
// per event stays correct for window-level move events too.
function makeConverter(surfaceElement, viewport) {
  return (event) => toLogicalFor(event, surfaceElement, viewport)
}

// Convert a pointer event to logical canvas units: undo the surface scroll (the
// canvas SVG scrolls inside the surface's overflow box), then pan, then zoom.
// `el` is the surface element (carrying getBoundingClientRect + scrollLeft/Top).
function toLogicalFor(event, el, viewport) {
  const rect = el.getBoundingClientRect()
  const { panX, panY, zoom } = viewport.state
  return {
    x: (event.clientX - rect.left + el.scrollLeft - panX) / zoom,
    y: (event.clientY - rect.top + el.scrollTop - panY) / zoom,
  }
}

// Topmost interactable shape (highest zIndex) under a logical point, or null.
// Hidden + locked shapes are skipped so they can't be grabbed (spec 7.4).
function topShapeAt(store, point) {
  const hits = store.state.shapes.filter((shape) => isInteractable(shape) && pointInShape(point, shape))
  if (!hits.length) return null
  return hits.reduce((top, shape) => ((shape.zIndex || 0) >= (top.zIndex || 0) ? shape : top))
}

// Click selects (a modifier toggles); a plain click on an unselected shape
// replaces the selection, then the body drag moves whatever ends up selected.
// Selection expands to the clicked shape's whole group so groups act as one unit.
function selectAndMove(store, transform, shape, event, toLogical, start) {
  const groupIds = store.expandGroups([shape.id])
  // Alt/Option-drag duplicates the selection (or the clicked shape's group) and
  // drags the copies — the Figma/Slides staple for fast layout.
  if (event.altKey) {
    const base = store.state.selection.includes(shape.id) ? store.state.selection : groupIds
    const copies = store.duplicate(base).filter((id) => store.shapeById(id))
    transform.startMove({ toLogical, start, ids: copies })
    return
  }
  if (isAdditiveEvent(event)) {
    const anySelected = groupIds.some((id) => store.state.selection.includes(id))
    store.select(
      anySelected
        ? store.state.selection.filter((id) => !groupIds.includes(id))
        : [...new Set([...store.state.selection, ...groupIds])],
    )
    return
  }
  if (!store.state.selection.includes(shape.id)) store.select(groupIds)
  const ids = store.state.selection.filter((id) => store.shapeById(id))
  transform.startMove({ toLogical, start, ids })
}

// Empty-canvas press: a modifier keeps the selection, plain press clears it;
// either way a drag turns into a marquee that selects intersected shapes.
function beginMarquee(store, marquee, event, toLogical, start) {
  const additive = isAdditiveEvent(event)
  if (!additive) store.clearSelection()
  marquee.begin({ toLogical, start, additive })
}
