<script setup>
// Canvas interaction layer for connector drawing (spec §5.3). Mounted inside the
// SVG <g>, it attaches the pointer listeners connector drawing needs, converts
// events to logical units via the <g> CTM, and renders the 8 connection anchors
// (4 corners + 4 edge centres) revealed on shapes ONLY while a connector tool is
// armed, plus the live draw preview. (Select-mode hover arrows were removed —
// connection points appear only when you're actually drawing a connector.)
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useConnectorDrawing } from '@/composables/useConnectorDrawing.js'
import { axisAlignedBBox } from '@/diagram/geometry.js'

defineProps({ hoverShapeId: { type: String, default: null } })

const store = useDiagramStore()
const editorUi = useEditorUi()
const drawing = useConnectorDrawing(store, editorUi)

// Last logical pointer position while the connector tool is armed, so anchors
// reveal as the cursor approaches a shape — before any drag starts (spec §5.3).
const pointer = ref(null)
// A shape reveals its anchors once the cursor comes within this many logical
// units of its box; the nearest anchor highlights as the snap target.
const REVEAL_MARGIN = 90

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
  if (drawing.draft.active) {
    drawing.updateDraw(point, event.shiftKey)
    pointer.value = point
  } else if (drawing.isDrawingConnector.value) {
    pointer.value = point
  }
}

function onPointerUp() {
  if (drawing.draft.active) drawing.commitDraw()
}

function onPointerLeave() {
  pointer.value = null
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
  svg.addEventListener('pointerleave', onPointerLeave)
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  if (!svg) return
  svg.removeEventListener('pointerdown', onPointerDown, true)
  svg.removeEventListener('pointermove', onPointerMove)
  svg.removeEventListener('pointerup', onPointerUp)
  svg.removeEventListener('pointerleave', onPointerLeave)
  window.removeEventListener('keydown', onKeyDown)
})

// Shortest distance from a point to a shape's axis-aligned box (0 when inside).
function distanceToBox(point, shape) {
  const box = axisAlignedBBox(shape)
  const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.w))
  const dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.h))
  return Math.hypot(dx, dy)
}

// The anchor the draw would snap to right now (nearest within the snap radius),
// so it can be highlighted as the live target. Null when none is in range.
const snapTarget = computed(() => {
  if (!drawing.isDrawingConnector.value) return null
  const probe = drawing.draft.active ? drawing.draft.end?.point : pointer.value
  return probe ? drawing.nearestAnchor(probe) : null
})

// Circular anchor hints, shown whenever the connector tool is armed: every
// shape's anchors while actively drawing, else only shapes the cursor is near.
// The current snap target is flagged so the template can highlight it.
const anchorHints = computed(() => {
  if (!drawing.isDrawingConnector.value) return []
  const active = drawing.draft.active
  const probe = active ? drawing.draft.end?.point : pointer.value
  if (!probe) return []
  const shapes = active
    ? store.state.shapes
    : store.state.shapes.filter((shape) => distanceToBox(probe, shape) <= REVEAL_MARGIN)
  const target = snapTarget.value
  return shapes.flatMap((shape) =>
    drawing.shapeAnchors(shape).map((anchor) => ({
      x: anchor.x,
      y: anchor.y,
      key: `${shape.id}-${anchor.name}`,
      active: Boolean(target && target.shapeId === shape.id && target.anchor === anchor.name),
    })),
  )
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

</script>

<template>
  <g ref="layer" data-hover-arrows>
    <!-- Anchors revealed on shapes while the connector tool is armed. The live
         snap target is filled + enlarged so it reads as the attach point. -->
    <circle
      v-for="anchor in anchorHints"
      :key="`anchor-${anchor.key}`"
      :cx="anchor.x"
      :cy="anchor.y"
      :r="anchor.active ? 6 : 4"
      :fill="anchor.active ? '#006EDB' : '#FFFFFF'"
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

  </g>
</template>
