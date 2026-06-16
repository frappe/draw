<script setup>
// Canvas interaction layer for hover-arrows AND connector drawing (spec §5.3).
// It is the single layer mounted inside the SVG <g>, so it attaches the pointer
// listeners both features need, converts events to logical units via the <g>
// CTM, and renders: the four blue hover arrows, the live draw preview, and the
// circular anchor hints shown while drawing.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useHoverArrows } from '@/composables/useHoverArrows.js'
import { useConnectorDrawing } from '@/composables/useConnectorDrawing.js'

defineProps({ hoverShapeId: { type: String, default: null } })

const store = useDiagramStore()
const editorUi = useEditorUi()
const hover = useHoverArrows(store, editorUi)
const drawing = useConnectorDrawing(store, editorUi)

const layer = ref(null)
let svg = null

// Convert a pointer event into logical canvas units via the SVG group CTM.
function toLogical(event) {
  const ctm = layer.value.getScreenCTM()
  if (!ctm) return { x: 0, y: 0 }
  const point = svg.createSVGPoint()
  point.x = event.clientX
  point.y = event.clientY
  const local = point.matrixTransform(ctm.inverse())
  return { x: local.x, y: local.y }
}

function onPointerDown(event) {
  if (!drawing.isDrawingConnector.value) return
  event.stopPropagation()
  layer.value.ownerSVGElement.setPointerCapture?.(event.pointerId)
  drawing.beginDraw(toLogical(event))
}

function onPointerMove(event) {
  const point = toLogical(event)
  if (drawing.draft.active) drawing.updateDraw(point, event.shiftKey)
  else if (editorUi.state.tool === 'select') hover.setHover(point)
}

function onPointerUp() {
  if (drawing.draft.active) drawing.commitDraw()
}

function onKeyDown(event) {
  if (event.key === 'Escape') drawing.cancelDraw()
}

onMounted(() => {
  svg = layer.value?.ownerSVGElement
  if (!svg) return
  svg.addEventListener('pointerdown', onPointerDown, true)
  svg.addEventListener('pointermove', onPointerMove)
  svg.addEventListener('pointerup', onPointerUp)
  svg.addEventListener('pointerleave', hover.clearHover)
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  if (!svg) return
  svg.removeEventListener('pointerdown', onPointerDown, true)
  svg.removeEventListener('pointermove', onPointerMove)
  svg.removeEventListener('pointerup', onPointerUp)
  svg.removeEventListener('pointerleave', hover.clearHover)
  window.removeEventListener('keydown', onKeyDown)
})

// Circular anchor hints on every shape while a connector is being drawn.
const anchorHints = computed(() => {
  if (!drawing.draft.active) return []
  return store.state.shapes.flatMap((shape) => drawing.shapeAnchors(shape))
})

const draftPath = computed(() => {
  const draft = drawing.draft
  if (!draft.active || !draft.start || !draft.end) return null
  const a = draft.start.point
  const b = draft.end.point
  if (draft.type === 'curved') return `M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${a.y} ${b.x} ${b.y}`
  if (draft.type === 'elbow') return `M ${a.x} ${a.y} L ${(a.x + b.x) / 2} ${a.y} L ${(a.x + b.x) / 2} ${b.y} L ${b.x} ${b.y}`
  return `M ${a.x} ${a.y} L ${b.x} ${b.y}`
})

// A chevron pointing outward (along the arrow's dx/dy) centred on its circle.
function chevron(arrow) {
  const cx = arrow.x
  const cy = arrow.y
  const tipX = cx + arrow.dx * 3
  const tipY = cy + arrow.dy * 3
  // Two wings are perpendicular to the outward direction, pulled inward.
  const wingX = -arrow.dx * 3
  const wingY = -arrow.dy * 3
  const a = { x: cx + arrow.dy * 3 + wingX, y: cy + arrow.dx * 3 + wingY }
  const c = { x: cx - arrow.dy * 3 + wingX, y: cy - arrow.dx * 3 + wingY }
  return `M ${a.x} ${a.y} L ${tipX} ${tipY} L ${c.x} ${c.y}`
}
</script>

<template>
  <g ref="layer" data-hover-arrows>
    <!-- Circular anchors revealed on every shape while drawing a connector. -->
    <circle
      v-for="(anchor, index) in anchorHints"
      :key="`anchor-${index}`"
      :cx="anchor.x"
      :cy="anchor.y"
      r="4"
      fill="#FFFFFF"
      stroke="#006EDB"
      stroke-width="1.5"
    />

    <!-- Live preview of the connector being drawn. -->
    <path
      v-if="draftPath"
      :d="draftPath"
      fill="none"
      stroke="#006EDB"
      stroke-width="2"
      stroke-dasharray="6 4"
      stroke-linecap="round"
    />

    <!-- Four blue directional arrows around an unselected hovered shape. -->
    <g
      v-for="arrow in hover.arrows.value"
      :key="`hover-${arrow.key}`"
      class="cursor-pointer"
      @pointerdown.stop.prevent
      @click.stop="hover.spawnInDirection(arrow.key)"
    >
      <circle :cx="arrow.x" :cy="arrow.y" r="9" fill="#FFFFFF" stroke="#006EDB" stroke-width="1.5" />
      <path
        :d="chevron(arrow)"
        fill="none"
        stroke="#006EDB"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </g>
  </g>
</template>
