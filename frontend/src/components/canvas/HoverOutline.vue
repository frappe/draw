<script setup>
// A subtle outline on the shape under the cursor in select mode, so every element
// — block shapes, flowchart nodes, text — gives a hover affordance (#261). A
// mind-map node is the exception (#427 item 3): it answers a hover with its "+"
// column instead. Self-contained like MindmapHoverHandles: it owns a listener on
// the SVG and renders a NON-interactive halo, so it never touches the core
// selection/pointer path. Skipped for the already-selected shape (its selection
// outline shows instead) and whenever a non-select tool is active. Mounted last in
// the viewport group so an opaque shape (unified canvas paints shapes via the
// whiteboard layer) can't occlude it, and drawn as a halo just OUTSIDE the box.
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { pointInShape } from '@/diagram/geometry.js'
import { isInteractable } from '@/diagram/shapeFlags.js'
import { cornerRadiusOf } from '@/diagram/shapeGeometry.js'

const store = useDiagramStore()
const editorUi = useEditorUi()
const layer = ref(null)
let svg = null
const hoveredId = ref(null)

const zoom = computed(() => editorUi.viewport.state.zoom || 1)
const selectTool = computed(() => editorUi.state.tool === 'select')
// Constant on-screen halo gap + stroke, independent of zoom.
const margin = computed(() => 3 / zoom.value)

function toLogical(event) {
  const ctm = layer.value?.getScreenCTM()
  if (!ctm) return null
  const p = svg.createSVGPoint()
  p.x = event.clientX
  p.y = event.clientY
  const l = p.matrixTransform(ctm.inverse())
  return { x: l.x, y: l.y }
}

// The topmost interactable shape actually under the point (by zIndex).
function shapeAt(point) {
  let best = null
  for (const shape of store.state.shapes || []) {
    if (!isInteractable(shape) || !pointInShape(point, shape)) continue
    if (!best || (shape.zIndex || 0) >= (best.zIndex || 0)) best = shape
  }
  return best
}

function onPointerMove(event) {
  if (!selectTool.value) {
    hoveredId.value = null
    return
  }
  const point = toLogical(event)
  hoveredId.value = point ? shapeAt(point)?.id ?? null : null
}
function onLeave() {
  hoveredId.value = null
}

onMounted(() => {
  svg = layer.value?.ownerSVGElement
  if (!svg) return
  svg.addEventListener('pointermove', onPointerMove)
  svg.addEventListener('pointerleave', onLeave)
})
onBeforeUnmount(() => {
  if (!svg) return
  svg.removeEventListener('pointermove', onPointerMove)
  svg.removeEventListener('pointerleave', onLeave)
})

// Only outline an UNSELECTED shape while hovering in select mode.
const outline = computed(() => {
  const id = hoveredId.value
  if (!id || !selectTool.value || store.state.selection.includes(id)) return null
  const shape = store.shapeById(id)
  if (!shape) return null
  // A mind-map node gets no halo (#427 item 3). Its hover affordance is the "+"
  // column revealing itself — a second blue box around a node that is already a
  // box was just noise on a canvas dense with branches, and it could not trace a
  // boxless (`shaped: false`) node at all.
  if (shape.role === 'mindmap-node') return null
  return {
    x: shape.x,
    y: shape.y,
    w: shape.w,
    h: shape.h,
    // The shape's own roundedness (#411), so the outline hugs the corner it traces.
    rx: cornerRadiusOf(shape) || 0,
  }
})
</script>

<template>
  <g ref="layer" data-hover-outline style="pointer-events: none">
    <rect
      v-if="outline"
      :x="outline.x - margin"
      :y="outline.y - margin"
      :width="outline.w + margin * 2"
      :height="outline.h + margin * 2"
      :rx="outline.rx + margin"
      fill="none"
      stroke="#006EDB"
      stroke-opacity="0.45"
      :stroke-width="1.5 / zoom"
    />
  </g>
</template>
