<script setup>
// Renders one shape (rectangle/ellipse/square/triangle/diamond/text) from a
// shape object. Geometry is in logical canvas units. Text boxes render with no
// fill and no border (spec §5.1). Interaction is layered on later.
import { computed } from 'vue'

const props = defineProps({
  shape: { type: Object, required: true },
})

const center = computed(() => ({
  x: props.shape.x + props.shape.w / 2,
  y: props.shape.y + props.shape.h / 2,
}))

const transform = computed(() =>
  props.shape.rotation
    ? `rotate(${props.shape.rotation} ${center.value.x} ${center.value.y})`
    : null,
)

const border = computed(() => props.shape.border || {})
const dashArray = computed(() =>
  border.value.dash === 'dashed' ? `${border.value.width * 3} ${border.value.width * 2}` : null,
)

// Triangle and diamond are polygons described by their bounding box corners.
const trianglePoints = computed(() => {
  const { x, y, w, h } = props.shape
  return `${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}`
})

const diamondPoints = computed(() => {
  const { x, y, w, h } = props.shape
  return `${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`
})

const fill = computed(() => props.shape.fill || 'none')
const textStyle = computed(() => props.shape.text?.style || {})
</script>

<template>
  <g :transform="transform" :data-shape-id="shape.id">
    <rect
      v-if="shape.type === 'rectangle' || shape.type === 'square'"
      :x="shape.x"
      :y="shape.y"
      :width="shape.w"
      :height="shape.h"
      :rx="8"
      :fill="fill"
      :fill-opacity="shape.opacity"
      :stroke="border.color"
      :stroke-width="border.width"
      :stroke-dasharray="dashArray"
    />
    <ellipse
      v-else-if="shape.type === 'ellipse'"
      :cx="center.x"
      :cy="center.y"
      :rx="shape.w / 2"
      :ry="shape.h / 2"
      :fill="fill"
      :fill-opacity="shape.opacity"
      :stroke="border.color"
      :stroke-width="border.width"
      :stroke-dasharray="dashArray"
    />
    <polygon
      v-else-if="shape.type === 'triangle'"
      :points="trianglePoints"
      :fill="fill"
      :fill-opacity="shape.opacity"
      :stroke="border.color"
      :stroke-width="border.width"
      :stroke-dasharray="dashArray"
    />
    <polygon
      v-else-if="shape.type === 'diamond'"
      :points="diamondPoints"
      :fill="fill"
      :fill-opacity="shape.opacity"
      :stroke="border.color"
      :stroke-width="border.width"
      :stroke-dasharray="dashArray"
    />

    <text
      v-if="shape.text?.content"
      :x="center.x"
      :y="center.y"
      text-anchor="middle"
      dominant-baseline="central"
      :fill="textStyle.color"
      :font-size="textStyle.size"
      :font-weight="textStyle.bold ? 700 : 500"
      :font-style="textStyle.italic ? 'italic' : 'normal'"
      :text-decoration="textStyle.underline ? 'underline' : 'none'"
      :opacity="shape.opacity"
      font-family="Inter, sans-serif"
    >
      {{ shape.text.content }}
    </text>
  </g>
</template>
