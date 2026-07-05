<script setup>
// Selection outline + 8 square resize handles + rotation handle (spec §5.2,
// §5.4), plus the live marquee rect. Handles render inside the viewport <g>, so
// their sizes are divided by zoom to stay constant on screen and they rotate
// with a single selected shape. Resize/rotate gestures run through
// useShapeTransform; the marquee rect comes from useSelection's marquee.
import { computed, inject } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useShapeTransform } from '@/composables/useShapeTransform.js'
import { shapeCenter } from '@/diagram/geometry.js'

const HANDLE = 12
const ROTATION_ARM = 28
const HANDLES = [
  'top-left', 'top', 'top-right', 'right',
  'bottom-right', 'bottom', 'bottom-left', 'left',
]
const HANDLE_FACTORS = {
  'top-left': [0, 0], top: [0.5, 0], 'top-right': [1, 0], right: [1, 0.5],
  'bottom-right': [1, 1], bottom: [0.5, 1], 'bottom-left': [0, 1], left: [0, 0.5],
}
// Standard two-sided resize cursor per handle, so hovering a handle reads as
// "drag to resize" (the diagonal pair share nwse/nesw).
const RESIZE_CURSORS = {
  'top-left': 'nwse-resize', 'bottom-right': 'nwse-resize',
  'top-right': 'nesw-resize', 'bottom-left': 'nesw-resize',
  top: 'ns-resize', bottom: 'ns-resize', left: 'ew-resize', right: 'ew-resize',
}

const store = useDiagramStore()
const editorUi = useEditorUi()
const transform = useShapeTransform(store, editorUi)
// useSelection (owned here and wired by Integration) shares its marquee via
// provide; falls back to no marquee when absent so the layer renders standalone.
const marquee = inject('selectionMarquee', null)

const selected = computed(() => store.selectedShapes)
const single = computed(() => (selected.value.length === 1 ? selected.value[0] : null))
const zoom = computed(() => editorUi.viewport.state.zoom || 1)
const handleSize = computed(() => HANDLE / zoom.value)
const strokeWidth = computed(() => 1.5 / zoom.value)

// Rotate the handle group with a single shape so handles track its orientation.
const groupTransform = computed(() => {
  const shape = single.value
  if (!shape?.rotation) return null
  const center = shapeCenter(shape)
  return `rotate(${shape.rotation} ${center.x} ${center.y})`
})

// The box the handles surround: the single shape's own box, or the union of all.
const box = computed(() => (single.value ? boxOf(single.value) : unionBox(selected.value)))

function boxOf(shape) {
  return { x: shape.x, y: shape.y, w: shape.w, h: shape.h }
}

function unionBox(shapes) {
  if (!shapes.length) return null
  const xs = shapes.flatMap((s) => [s.x, s.x + s.w])
  const ys = shapes.flatMap((s) => [s.y, s.y + s.h])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

function handlePosition(name) {
  const [fx, fy] = HANDLE_FACTORS[name]
  return { x: box.value.x + box.value.w * fx, y: box.value.y + box.value.h * fy }
}

const rotationKnob = computed(() => ({
  x: box.value.x + box.value.w / 2,
  y: box.value.y - ROTATION_ARM / zoom.value,
}))

// Build a client→logical converter from the SVG rect + viewport for a gesture.
function converterFrom(event) {
  const rect = event.currentTarget.ownerSVGElement.getBoundingClientRect()
  const viewport = editorUi.viewport
  return (moveEvent) => ({
    x: (moveEvent.clientX - rect.left - viewport.state.panX) / viewport.state.zoom,
    y: (moveEvent.clientY - rect.top - viewport.state.panY) / viewport.state.zoom,
  })
}

function startResize(name, event) {
  if (!single.value) return
  event.stopPropagation()
  transform.startResize({ toLogical: converterFrom(event), handle: name, id: single.value.id })
}

function startRotate(event) {
  if (!single.value) return
  event.stopPropagation()
  transform.startRotate({ toLogical: converterFrom(event), id: single.value.id })
}
</script>

<template>
  <g data-selection-layer>
    <!-- Per-shape dashed outline so every selected shape reads as selected. -->
    <rect
      v-for="shape in selected"
      :key="shape.id"
      :x="shape.x"
      :y="shape.y"
      :width="shape.w"
      :height="shape.h"
      :transform="
        shape.rotation
          ? `rotate(${shape.rotation} ${shape.x + shape.w / 2} ${shape.y + shape.h / 2})`
          : null
      "
      fill="none"
      stroke="#006EDB"
      :stroke-width="strokeWidth"
      :stroke-dasharray="`${4 / zoom} ${3 / zoom}`"
    />

    <!-- Handles + rotation handle: single selection only, rotating with it. -->
    <g v-if="single" :transform="groupTransform">
      <line
        :x1="box.x + box.w / 2"
        :y1="box.y"
        :x2="rotationKnob.x"
        :y2="rotationKnob.y"
        stroke="#006EDB"
        :stroke-width="strokeWidth"
      />
      <!-- Rotation knob: a rotate glyph (circular arrow) rather than a bare dot. -->
      <g
        :transform="`translate(${rotationKnob.x} ${rotationKnob.y})`"
        style="cursor: grab"
        @pointerdown="startRotate"
      >
        <circle :r="9 / zoom" fill="#FFFFFF" stroke="#006EDB" :stroke-width="strokeWidth" />
        <g :transform="`scale(${0.5 / zoom}) translate(-12 -12)`" style="pointer-events: none">
          <path
            d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"
            fill="none"
            stroke="#006EDB"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path d="M21 3v5h-5" fill="none" stroke="#006EDB" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        </g>
      </g>
      <rect
        v-for="name in HANDLES"
        :key="name"
        :x="handlePosition(name).x - handleSize / 2"
        :y="handlePosition(name).y - handleSize / 2"
        :width="handleSize"
        :height="handleSize"
        :rx="2.5 / zoom"
        fill="#FFFFFF"
        stroke="#006EDB"
        :stroke-width="strokeWidth"
        :style="{ cursor: RESIZE_CURSORS[name] }"
        @pointerdown="startResize(name, $event)"
      />
    </g>

    <!-- Live marquee rectangle (logical units) while dragging empty canvas. -->
    <rect
      v-if="marquee && marquee.rect.value"
      :x="marquee.rect.value.x"
      :y="marquee.rect.value.y"
      :width="marquee.rect.value.w"
      :height="marquee.rect.value.h"
      fill="#006EDB"
      fill-opacity="0.08"
      stroke="#006EDB"
      :stroke-width="strokeWidth"
      :stroke-dasharray="`${4 / zoom} ${3 / zoom}`"
    />
  </g>
</template>
