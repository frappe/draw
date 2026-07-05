import { computed, unref } from 'vue'
import { useEditorUi } from '@/stores/useEditorUi.js'

// Gap (screen px) between a selection's top and the toolbar's bottom. Large
// enough to clear the rotation handle above a block shape (SelectionLayer's
// ROTATION_ARM = 28 + knob radius), so the toolbar always sits clearly OUTSIDE
// the shape rather than overlapping it or the handle.
const TOOLBAR_GAP = 40

// Positions a floating contextual toolbar just above a canvas selection box.
// The four selection editors (block/flowchart/whiteboard/mindmap) all placed a
// fixed toolbar the same way, so it lives here once: find the canvas surface,
// undo its scroll + pan, add the box's top-centre in screen units, then lift by
// TOOLBAR_GAP. The element carries `-translate-x-1/2 -translate-y-full`, so this
// returns that lifted top-centre point; returns display:none when there's no box.
export function useCanvasToolbarStyle(boxRef) {
  const viewport = useEditorUi().viewport
  return computed(() => {
    const box = unref(boxRef)
    if (!box) return { display: 'none' }
    const surface = document.querySelector('[data-fdpreset]')
    const rect = surface ? surface.getBoundingClientRect() : { left: 0, top: 0 }
    // The canvas SVG scrolls inside the surface's overflow box, so screen
    // position must undo scrollLeft/scrollTop too (or the toolbar drifts off the
    // selection on a panned canvas).
    const scrollLeft = surface ? surface.scrollLeft : 0
    const scrollTop = surface ? surface.scrollTop : 0
    const { panX, panY, zoom } = viewport.state
    const cx = rect.left - scrollLeft + panX + (box.x + box.w / 2) * zoom
    const top = rect.top - scrollTop + panY + box.y * zoom
    return { left: `${cx}px`, top: `${top - TOOLBAR_GAP}px` }
  })
}
