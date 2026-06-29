<script setup>
// Renders one connector (straight/curved/elbow) between two resolved endpoints,
// with single/double arrowheads and a midpoint label pill (spec §5.3, §6).
// Endpoints may be free {x,y} or attached {shapeId,anchor}; attached ends follow
// the shape on move/rotate because resolve() reads anchorPoint reactively.
// When selected, draggable endpoint handles allow re-attach/detach, and curved
// connectors expose a draggable midpoint control handle.
import { ref, computed } from 'vue'
import { anchorPoint } from '@/diagram/geometry.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useConnectorDrawing } from '@/composables/useConnectorDrawing.js'
import ConnectorMarker from './ConnectorMarker.vue'

const props = defineProps({ connector: { type: Object, required: true } })

// Normalise an endpoint style: legacy booleans (true/false) → 'arrow'/'none'.
function normEnd(value) {
  if (value === true) return 'arrow'
  if (value === false || value == null) return 'none'
  return value
}

const store = useDiagramStore()
const editorUi = useEditorUi()
const drawing = useConnectorDrawing(store, editorUi)

// Resolve an endpoint to a concrete world point (attached anchor or free point).
function resolve(endpoint) {
  if (endpoint && endpoint.shapeId) {
    const shape = store?.shapeById(endpoint.shapeId)
    if (shape) return anchorPoint(shape, endpoint.anchor || 'right')
  }
  return { x: endpoint?.x || 0, y: endpoint?.y || 0 }
}

const start = computed(() => resolve(props.connector.from))
const end = computed(() => resolve(props.connector.to))

// Curved connectors carry an optional control point; default to the apex above.
const control = computed(() => {
  const stored = props.connector.midpoint
  if (stored) return stored
  return { x: (start.value.x + end.value.x) / 2, y: start.value.y }
})

const elbowMidX = computed(() => (start.value.x + end.value.x) / 2)

const selected = computed(() => store.state.selection.includes(props.connector.id))
const style = computed(() => props.connector.style || {})

// Dash pattern scales with width so dashes/dots stay proportional at any weight.
const dashArray = computed(() => {
  const w = style.value.width || 2.2
  if (style.value.dash === 'dashed') return `${w * 3} ${w * 2}`
  if (style.value.dash === 'dotted') return `${w} ${w * 2}`
  return null
})

const pathData = computed(() => {
  const a = start.value
  const b = end.value
  if (props.connector.type === 'curved') return `M ${a.x} ${a.y} Q ${control.value.x} ${control.value.y} ${b.x} ${b.y}`
  if (props.connector.type === 'elbow') return elbowPath(a, b, elbowMidX.value, style.value.corner)
  return `M ${a.x} ${a.y} L ${b.x} ${b.y}`
})

// Two-bend elbow A→(midX,A.y)→(midX,B.y)→B. 'rounded' replaces each right-angle
// bend with a quadratic arc whose radius is clamped to the shortest leg so it
// never overshoots on a tight route; 'sharp' keeps the literal corners.
function elbowPath(a, b, midX, corner) {
  const sharp = `M ${a.x} ${a.y} L ${midX} ${a.y} L ${midX} ${b.y} L ${b.x} ${b.y}`
  if (corner === 'sharp') return sharp
  const r = Math.min(14, Math.abs(midX - a.x) / 2, Math.abs(b.y - a.y) / 2, Math.abs(b.x - midX) / 2)
  if (!(r > 0.5)) return sharp
  const sx1 = Math.sign(midX - a.x)
  const sy = Math.sign(b.y - a.y)
  const sx2 = Math.sign(b.x - midX)
  return (
    `M ${a.x} ${a.y} L ${midX - sx1 * r} ${a.y} ` +
    `Q ${midX} ${a.y} ${midX} ${a.y + sy * r} ` +
    `L ${midX} ${b.y - sy * r} ` +
    `Q ${midX} ${b.y} ${midX + sx2 * r} ${b.y} L ${b.x} ${b.y}`
  )
}

// Label pill sits at the geometric midpoint of the route.
const labelAnchor = computed(() => {
  if (props.connector.type === 'curved') {
    const q = control.value
    return { x: (start.value.x + 2 * q.x + end.value.x) / 4, y: (start.value.y + 2 * q.y + end.value.y) / 4 }
  }
  return { x: (start.value.x + end.value.x) / 2, y: (start.value.y + end.value.y) / 2 }
})

const startMarkerId = computed(() => `mk-start-${props.connector.id}`)
const endMarkerId = computed(() => `mk-end-${props.connector.id}`)
const startType = computed(() => normEnd(props.connector.arrowheads?.start))
const endType = computed(() => normEnd(props.connector.arrowheads?.end))
const labelWidth = computed(() => (props.connector.label?.length || 0) * 7 + 16)

// Endpoint / control-point dragging. Reuses the snap logic from the composable.
const dragging = ref(null)

function toLogical(event, node) {
  const ctm = node.ownerSVGElement.getScreenCTM()
  const point = node.ownerSVGElement.createSVGPoint()
  point.x = event.clientX
  point.y = event.clientY
  const local = point.matrixTransform(ctm.inverse())
  return { x: local.x, y: local.y }
}

function startDrag(which, event) {
  dragging.value = which
  event.target.setPointerCapture?.(event.pointerId)
}

function onDrag(event) {
  if (!dragging.value) return
  const point = toLogical(event, event.target)
  if (dragging.value === 'control') {
    store.updateConnector(props.connector.id, { midpoint: { x: Math.round(point.x), y: Math.round(point.y) } })
    return
  }
  drawing.moveEndpoint(props.connector.id, dragging.value, point)
}

function endDrag() {
  dragging.value = null
}

function onConnectorClick(event) {
  event.stopPropagation()
  if (event.shiftKey) store.addToSelection(props.connector.id)
  else store.select(props.connector.id)
}
</script>

<template>
  <g :data-connector-id="connector.id">
    <defs>
      <ConnectorMarker :id="startMarkerId" :type="startType" :color="style.color" orient="auto-start-reverse" />
      <ConnectorMarker :id="endMarkerId" :type="endType" :color="style.color" orient="auto" />
    </defs>

    <!-- Wide invisible hit path makes the thin connector easy to click. -->
    <path :d="pathData" fill="none" stroke="transparent" stroke-width="14" class="cursor-pointer" @click="onConnectorClick" />

    <path
      :d="pathData"
      fill="none"
      :stroke="style.color"
      :stroke-width="style.width"
      :stroke-dasharray="dashArray"
      stroke-linecap="round"
      stroke-linejoin="round"
      :marker-start="startType !== 'none' ? `url(#${startMarkerId})` : null"
      :marker-end="endType !== 'none' ? `url(#${endMarkerId})` : null"
    />

    <g v-if="connector.label">
      <rect
        :x="labelAnchor.x - labelWidth / 2"
        :y="labelAnchor.y - 11"
        :width="labelWidth"
        height="22"
        rx="6"
        fill="#FFFFFF"
        stroke="#E2E2E2"
        stroke-width="1"
      />
      <text
        :x="labelAnchor.x"
        :y="labelAnchor.y"
        text-anchor="middle"
        dominant-baseline="central"
        font-size="12"
        font-family="Inter, sans-serif"
        fill="#525252"
      >
        {{ connector.label }}
      </text>
    </g>

    <!-- Selection: draggable endpoints (re-attach/detach) + curved midpoint handle. -->
    <g v-if="selected">
      <circle
        :cx="control.x"
        :cy="control.y"
        r="6"
        fill="#FFFFFF"
        stroke="#006EDB"
        stroke-width="1.5"
        class="cursor-move"
        v-if="connector.type === 'curved'"
        @pointerdown.stop.prevent="startDrag('control', $event)"
        @pointermove="onDrag"
        @pointerup="endDrag"
      />
      <circle
        :cx="start.x"
        :cy="start.y"
        r="6"
        fill="#FFFFFF"
        stroke="#006EDB"
        stroke-width="1.5"
        class="cursor-move"
        @pointerdown.stop.prevent="startDrag('from', $event)"
        @pointermove="onDrag"
        @pointerup="endDrag"
      />
      <circle
        :cx="end.x"
        :cy="end.y"
        r="6"
        fill="#FFFFFF"
        stroke="#006EDB"
        stroke-width="1.5"
        class="cursor-move"
        @pointerdown.stop.prevent="startDrag('to', $event)"
        @pointermove="onDrag"
        @pointerup="endDrag"
      />
    </g>
  </g>
</template>
