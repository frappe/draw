<script setup>
// Whiteboard minimap / navigator (spec diagram-types C2/W6). A small overview of
// the whole board content plus a rectangle showing the current viewport; click
// or drag inside it to pan there. It reflects content (strokes/stickies/shapes)
// and the pan/zoom, and routes panning through the shared viewport (Part G4) so
// the canvas and minimap never disagree. Floated bottom-right like the other
// types' Minimap (spec Q10/B2), for a consistent navigator across all types.
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { whiteboardContentBounds } from '@/diagram/whiteboardLayout.js'

const store = useDiagramStore()
const editorUi = useEditorUi()
const viewport = editorUi.viewport

const WIDTH = 180
const HEIGHT = 120

// The canvas surface element (carries data-fdpreset) gives us the live viewport
// pixel size needed to draw the "what you can see now" rectangle.
const surface = ref(null)
const surfaceSize = ref({ w: 0, h: 0 })

function measureSurface() {
  surface.value = document.querySelector('[data-fdpreset]')
  if (surface.value) {
    const rect = surface.value.getBoundingClientRect()
    surfaceSize.value = { w: rect.width, h: rect.height }
  }
}

let resize = null
onMounted(() => {
  measureSurface()
  resize = () => measureSurface()
  window.addEventListener('resize', resize)
})
onBeforeUnmount(() => window.removeEventListener('resize', resize))

// Content bounds union (Part G8), with a sane fallback for an empty board.
const bounds = computed(() => whiteboardContentBounds(store.state.whiteboard, store.state.shapes))

// Scale that fits the content bounds into the minimap box, preserving aspect.
const scale = computed(() => Math.min(WIDTH / bounds.value.w, HEIGHT / bounds.value.h))

function toMini(x, y) {
  return { x: (x - bounds.value.x) * scale.value, y: (y - bounds.value.y) * scale.value }
}

// Visible viewport rect in canvas units, mapped into the minimap.
const viewRect = computed(() => {
  const zoom = viewport.state.zoom || 1
  const topLeft = { x: -viewport.state.panX / zoom, y: -viewport.state.panY / zoom }
  const visW = surfaceSize.value.w / zoom
  const visH = surfaceSize.value.h / zoom
  const a = toMini(topLeft.x, topLeft.y)
  return { x: a.x, y: a.y, w: visW * scale.value, h: visH * scale.value }
})

// Content previews (sticky rects + stroke bboxes) in minimap space.
const stickies = computed(() =>
  store.state.whiteboard.stickyNotes.map((note) => {
    const p = toMini(note.x, note.y)
    return { id: note.id, x: p.x, y: p.y, w: note.w * scale.value, h: note.h * scale.value, color: note.color }
  }),
)

const strokeDots = computed(() =>
  store.state.whiteboard.strokes.map((stroke) => {
    const mid = stroke.points[Math.floor(stroke.points.length / 2)] || stroke.points[0]
    const p = mid ? toMini(mid.x, mid.y) : { x: 0, y: 0 }
    return { id: stroke.id, x: p.x, y: p.y, color: stroke.color }
  }),
)

// Click/drag in the minimap pans so the clicked content point centers in view.
function panTo(event) {
  measureSurface()
  const rect = event.currentTarget.getBoundingClientRect()
  const miniX = event.clientX - rect.left
  const miniY = event.clientY - rect.top
  const canvasX = bounds.value.x + miniX / scale.value
  const canvasY = bounds.value.y + miniY / scale.value
  const zoom = viewport.state.zoom || 1
  viewport.setPan(surfaceSize.value.w / 2 - canvasX * zoom, surfaceSize.value.h / 2 - canvasY * zoom)
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
</script>

<template>
  <div
    class="absolute bottom-3 right-3 z-10 rounded-lg border border-outline-gray-2 bg-surface-base/95 p-1 shadow-md backdrop-blur"
    aria-label="Navigator"
  >
    <svg
      :width="WIDTH"
      :height="HEIGHT"
      class="rounded"
      style="cursor: pointer"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointerleave="onUp"
    >
      <rect
        v-for="sticky in stickies"
        :key="sticky.id"
        :x="sticky.x"
        :y="sticky.y"
        :width="Math.max(2, sticky.w)"
        :height="Math.max(2, sticky.h)"
        :fill="sticky.color"
      />
      <circle v-for="dot in strokeDots" :key="dot.id" :cx="dot.x" :cy="dot.y" r="1.6" :fill="dot.color" />
      <rect
        :x="viewRect.x"
        :y="viewRect.y"
        :width="Math.max(4, viewRect.w)"
        :height="Math.max(4, viewRect.h)"
        fill="rgba(0,110,219,0.08)"
        stroke="#006EDB"
        stroke-width="1.5"
      />
    </svg>
  </div>
</template>
