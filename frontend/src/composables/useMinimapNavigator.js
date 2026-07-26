// Shared navigator mechanics for the floating minimaps (spec Q10/B2, C2/W6).
// Minimap.vue (block / flowchart / mind map) and WhiteboardMinimap.vue draw
// different content but navigate identically: fit a content-bounds rect into a
// fixed 180x120 box, show where the viewport currently sits, and pan on
// click/drag so the picked point centres in view. That mapping lived twice, so
// the two could disagree about the same gesture — it lives here once now.
//
// The caller supplies `bounds` (a computed {x,y,w,h} in canvas units) and renders
// its own content through the returned toMini(); everything else is common.

import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useEditorUi } from '@/stores/useEditorUi.js'

export const WIDTH = 180
export const HEIGHT = 120

export function useMinimapNavigator(bounds) {
  const viewport = useEditorUi().viewport

  // Live surface pixel size, needed to size the "what you can see now" rect. The
  // canvas surface is the element carrying data-fdpreset.
  const surfaceSize = ref({ w: 0, h: 0 })
  function measureSurface() {
    const el = document.querySelector('[data-fdpreset]')
    if (el) {
      const rect = el.getBoundingClientRect()
      surfaceSize.value = { w: rect.width, h: rect.height }
    }
  }

  let onResize = null
  onMounted(() => {
    measureSurface()
    onResize = () => measureSurface()
    window.addEventListener('resize', onResize)
  })
  onBeforeUnmount(() => window.removeEventListener('resize', onResize))

  // Scale that fits the content bounds into the minimap box, preserving aspect.
  const scale = computed(() => Math.min(WIDTH / bounds.value.w, HEIGHT / bounds.value.h))

  function toMini(x, y) {
    return { x: (x - bounds.value.x) * scale.value, y: (y - bounds.value.y) * scale.value }
  }

  // The visible viewport in minimap space, unclamped — it can extend past the box
  // when you are zoomed out past the content.
  const viewRect = computed(() => {
    const zoom = viewport.state.zoom || 1
    const a = toMini(-viewport.state.panX / zoom, -viewport.state.panY / zoom)
    return {
      x: a.x,
      y: a.y,
      w: (surfaceSize.value.w / zoom) * scale.value,
      h: (surfaceSize.value.h / zoom) * scale.value,
    }
  })

  // Same rect cropped to the minimap box, for the navigators that want the blue
  // boundary to stay inside their frame.
  const clampedViewRect = computed(() => {
    const raw = viewRect.value
    const x = Math.max(0, raw.x)
    const y = Math.max(0, raw.y)
    return {
      x,
      y,
      w: Math.max(0, Math.min(WIDTH, raw.x + raw.w) - x),
      h: Math.max(0, Math.min(HEIGHT, raw.y + raw.h) - y),
    }
  })

  // Click/drag in the minimap pans so the picked content point centres in view.
  function panTo(event) {
    measureSurface()
    const rect = event.currentTarget.getBoundingClientRect()
    const canvasX = bounds.value.x + (event.clientX - rect.left) / scale.value
    const canvasY = bounds.value.y + (event.clientY - rect.top) / scale.value
    const zoom = viewport.state.zoom || 1
    viewport.setPan(
      surfaceSize.value.w / 2 - canvasX * zoom,
      surfaceSize.value.h / 2 - canvasY * zoom,
    )
  }

  const dragging = ref(false)
  function onDown(event) {
    dragging.value = true
    panTo(event)
  }
  function onMove(event) {
    if (dragging.value) panTo(event)
  }
  function onUp() {
    dragging.value = false
  }

  return {
    surfaceSize,
    measureSurface,
    scale,
    toMini,
    viewRect,
    clampedViewRect,
    dragging,
    onDown,
    onMove,
    onUp,
  }
}
