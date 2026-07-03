import { computed, unref } from 'vue'
import { useEditorUi } from '@/stores/useEditorUi.js'

// Positions a floating contextual toolbar just above a canvas selection box.
// The four selection editors (block/flowchart/whiteboard/mindmap) all placed a
// fixed toolbar the same way — find the canvas surface rect, undo pan, then add
// the box's top-centre in screen units (with a 12px lift) — so it lives here once.
// The element itself carries `-translate-x-1/2 -translate-y-full`, so this returns
// the box's top-centre point; returns display:none when there's no box.
export function useCanvasToolbarStyle(boxRef) {
  const viewport = useEditorUi().viewport
  return computed(() => {
    const box = unref(boxRef)
    if (!box) return { display: 'none' }
    const surface = document.querySelector('[data-fdpreset]')
    const rect = surface ? surface.getBoundingClientRect() : { left: 0, top: 0 }
    const { panX, panY, zoom } = viewport.state
    const cx = rect.left + panX + (box.x + box.w / 2) * zoom
    const top = rect.top + panY + box.y * zoom
    return { left: `${cx}px`, top: `${top - 12}px` }
  })
}
