<script setup>
// Live collaborator cursors (spec 11.1) driven by Yjs awareness. Tracks the local
// pointer over the canvas (→ awareness) and renders each remote peer's cursor +
// name at their canvas point, transformed through the shared viewport so they
// stay put at any pan/zoom.
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useEditorUi } from '@/stores/useEditorUi.js'

const props = defineProps({
  collaborators: { type: Array, default: () => [] },
  setCursor: { type: Function, default: () => {} },
})

const editorUi = useEditorUi()
const viewport = editorUi.viewport

function surfaceRect() {
  const el = document.querySelector('[data-fdpreset]')
  return el ? el.getBoundingClientRect() : { left: 0, top: 0 }
}

// Remote cursors mapped to screen coordinates (reactive on pan/zoom).
const cursors = computed(() => {
  const rect = surfaceRect()
  const { panX, panY, zoom } = viewport.state
  return props.collaborators
    .filter((c) => c.cursor)
    .map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      left: rect.left + panX + c.cursor.x * zoom,
      top: rect.top + panY + c.cursor.y * zoom,
    }))
})

// Broadcast the local pointer as a canvas-space point (throttled).
let last = 0
function onMove(event) {
  const now = Date.now()
  if (now - last < 45) return
  last = now
  const rect = surfaceRect()
  const { panX, panY, zoom } = viewport.state
  props.setCursor({
    x: (event.clientX - rect.left - panX) / zoom,
    y: (event.clientY - rect.top - panY) / zoom,
  })
}
function onLeave() {
  props.setCursor(null)
}

let surface = null
onMounted(() => {
  surface = document.querySelector('[data-fdpreset]')
  if (surface) {
    surface.addEventListener('pointermove', onMove)
    surface.addEventListener('pointerleave', onLeave)
  }
})
onBeforeUnmount(() => {
  if (surface) {
    surface.removeEventListener('pointermove', onMove)
    surface.removeEventListener('pointerleave', onLeave)
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      v-for="c in cursors"
      :key="c.id"
      class="pointer-events-none fixed z-40 -translate-y-1"
      :style="{ left: `${c.left}px`, top: `${c.top}px` }"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" :style="{ fill: c.color }">
        <path d="M2 2 L2 14 L6 10 L9 16 L11 15 L8 9 L14 9 Z" stroke="#FFFFFF" stroke-width="0.8" />
      </svg>
      <span
        class="ml-2 mt-0.5 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium text-white"
        :style="{ background: c.color }"
      >
        {{ c.name }}
      </span>
    </div>
  </Teleport>
</template>
