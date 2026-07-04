<script setup>
// Floating minimap / navigator for block, flowchart and mind-map diagrams
// (spec 1.1). Whiteboard has its own (WhiteboardMinimap) in its palette, so this
// is shown for the other types. It draws a simplified vector overview (one rect
// per shape/node — cheap, updates live, no rasterization) plus a rectangle for
// the current viewport; click or drag to pan there through the shared viewport.
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useModeStrategy } from '@/stores/useModeStrategy.js'
import { axisAlignedBBox } from '@/diagram/geometry.js'
import { isVisible } from '@/diagram/shapeFlags.js'
import { layoutMindMap } from '@/diagram/mindmapLayout.js'
import { flowchartContentBounds } from '@/diagram/flowchartLayout.js'
import { nodeSize as flowchartNodeSize } from '@/diagram/flowchartModel.js'

const store = useDiagramStore()
const editorUi = useEditorUi()
const viewport = editorUi.viewport
const modeStrategy = useModeStrategy()

const WIDTH = 180
const HEIGHT = 120
const PAD = 24

const type = computed(() => modeStrategy.value.type)
// The whiteboard has its own navigator; every other type shows this one, even
// when empty, so the mini-navigator is always available (S4/B2/N15).
const shown = computed(() => type.value !== 'whiteboard')

// Live surface pixel size (for the viewport rectangle).
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

// Simplified content rects in canvas units, per diagram type.
const items = computed(() => {
  if (type.value === 'flowchart' && store.state.flowchart) {
    return store.state.flowchart.nodes.map((n) => {
      const s = flowchartNodeSize(n)
      return { id: n.id, x: n.x, y: n.y, w: s.w, h: s.h, fill: n.fill || '#D4D4D8' }
    })
  }
  if (type.value === 'mindmap' && store.state.mindmap) {
    const { positions } = layoutMindMap(store.state.mindmap)
    return Object.entries(positions).map(([id, b]) => ({ id, x: b.x, y: b.y, w: b.w, h: b.h, fill: '#D4D4D8' }))
  }
  return store.state.shapes
    .filter(isVisible)
    .map((s) => {
      const b = axisAlignedBBox(s)
      return { id: s.id, x: b.x, y: b.y, w: b.w, h: b.h, fill: s.fill && s.fill !== 'none' ? s.fill : '#CBD5E1' }
    })
})

// Bounding frame over the content (+ the canvas rect for block) with padding.
const frame = computed(() => {
  const xs = []
  const ys = []
  for (const it of items.value) {
    xs.push(it.x, it.x + it.w)
    ys.push(it.y, it.y + it.h)
  }
  if (type.value === 'block') {
    xs.push(0, store.state.canvas.width)
    ys.push(0, store.state.canvas.height)
  }
  if (!xs.length) return { x: 0, y: 0, w: 1, h: 1 }
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { x: minX - PAD, y: minY - PAD, w: Math.max(1, Math.max(...xs) - minX + PAD * 2), h: Math.max(1, Math.max(...ys) - minY + PAD * 2) }
})

const scale = computed(() => Math.min(WIDTH / frame.value.w, HEIGHT / frame.value.h))

function toMini(x, y) {
  return { x: (x - frame.value.x) * scale.value, y: (y - frame.value.y) * scale.value }
}

const miniItems = computed(() =>
  items.value.map((it) => {
    const p = toMini(it.x, it.y)
    return { id: it.id, x: p.x, y: p.y, w: Math.max(1.5, it.w * scale.value), h: Math.max(1.5, it.h * scale.value), fill: it.fill }
  }),
)

// Current viewport mapped into the minimap.
const viewRect = computed(() => {
  const zoom = viewport.state.zoom || 1
  const a = toMini(-viewport.state.panX / zoom, -viewport.state.panY / zoom)
  return { x: a.x, y: a.y, w: (surfaceSize.value.w / zoom) * scale.value, h: (surfaceSize.value.h / zoom) * scale.value }
})

// Click/drag pans so the picked content point centres in the viewport.
function panTo(event) {
  measureSurface()
  const rect = event.currentTarget.getBoundingClientRect()
  const canvasX = frame.value.x + (event.clientX - rect.left) / scale.value
  const canvasY = frame.value.y + (event.clientY - rect.top) / scale.value
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
    v-if="shown"
    class="absolute bottom-3 right-3 z-10 rounded-lg border border-outline-gray-2 bg-surface-base/95 p-1 shadow-md backdrop-blur"
    aria-label="Minimap"
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
        v-for="it in miniItems"
        :key="it.id"
        :x="it.x"
        :y="it.y"
        :width="it.w"
        :height="it.h"
        :fill="it.fill"
        rx="1"
      />
      <rect
        :x="viewRect.x"
        :y="viewRect.y"
        :width="Math.max(4, viewRect.w)"
        :height="Math.max(4, viewRect.h)"
        fill="rgba(0,110,219,0.10)"
        stroke="#006EDB"
        stroke-width="1.5"
      />
    </svg>
  </div>
</template>
