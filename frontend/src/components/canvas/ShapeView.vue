<script setup>
// Renders one shape (rectangle/ellipse/square/triangle/diamond/text) from a
// shape object. Geometry is in logical canvas units. Text boxes render with no
// fill and no border (spec §5.1). Interaction is layered on later.
import { computed } from 'vue'
import { useTextEditing, shapeTextArea, textStyleCss } from '@/composables/useTextEditing.js'

const props = defineProps({
  shape: { type: Object, required: true },
})

const editing = useTextEditing()

// Hide the static text while this shape is being edited (the editor overlay
// shows instead, avoiding double text).
const isEditingThis = computed(() => editing?.editingShapeId?.value === props.shape.id)

// Rich text renders as HTML in a foreignObject; legacy shapes with only a plain
// `content` string still render as a single SVG <text> (backward compatible).
const richHtml = computed(() => props.shape.text?.html || null)
const textArea = computed(() => shapeTextArea(props.shape))
const richStyle = computed(() => {
  const text = props.shape.text || {}
  return {
    ...textStyleCss(text.style, text.valign, text.align),
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    pointerEvents: 'none',
    overflow: 'hidden',
    opacity: props.shape.opacity ?? 1,
  }
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

// Polygon shapes described by normalized (0..1) points scaled to the box.
const POLYGONS = {
  pentagon: [[0.5, 0], [1, 0.38], [0.82, 1], [0.18, 1], [0, 0.38]],
  hexagon: [[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]],
  arrow: [[0, 0.3], [0.62, 0.3], [0.62, 0.05], [1, 0.5], [0.62, 0.95], [0.62, 0.7], [0, 0.7]],
}
function scale(points) {
  const { x, y, w, h } = props.shape
  return points.map(([nx, ny]) => `${x + nx * w},${y + ny * h}`).join(' ')
}
const polygonPoints = computed(() => (POLYGONS[props.shape.type] ? scale(POLYGONS[props.shape.type]) : ''))

// Five-pointed star generated around the box centre.
const starPoints = computed(() => {
  const { x, y, w, h } = props.shape
  const cx = x + w / 2
  const cy = y + h / 2
  const pts = []
  for (let i = 0; i < 10; i += 1) {
    const angle = (-90 + i * 36) * (Math.PI / 180)
    const rx = (i % 2 ? 0.2 : 0.5) * w
    const ry = (i % 2 ? 0.2 : 0.5) * h
    pts.push(`${cx + rx * Math.cos(angle)},${cy + ry * Math.sin(angle)}`)
  }
  return pts.join(' ')
})

// Cylinder: a body path; the top rim ellipse is drawn separately for the lid.
const cylinderRy = computed(() => Math.min(props.shape.h * 0.16, 18))
const cylinderBody = computed(() => {
  const { x, y, w, h } = props.shape
  const ry = cylinderRy.value
  return `M ${x} ${y + ry} A ${w / 2} ${ry} 0 0 1 ${x + w} ${y + ry} L ${x + w} ${y + h - ry} A ${w / 2} ${ry} 0 0 1 ${x} ${y + h - ry} Z`
})

// Callout: a rounded body with a small tail at the bottom-left.
const calloutPath = computed(() => {
  const { x, y, w, h } = props.shape
  const bodyH = h * 0.78
  const r = Math.min(14, bodyH / 2, w / 2)
  return (
    `M ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${y + bodyH - r} ` +
    `Q ${x + w} ${y + bodyH} ${x + w - r} ${y + bodyH} H ${x + w * 0.34} L ${x + w * 0.2} ${y + h} ` +
    `L ${x + w * 0.22} ${y + bodyH} H ${x + r} Q ${x} ${y + bodyH} ${x} ${y + bodyH - r} V ${y + r} Q ${x} ${y} ${x + r} ${y} Z`
  )
})

const fill = computed(() => props.shape.fill || 'none')
const textStyle = computed(() => props.shape.text?.style || {})
</script>

<template>
  <g :transform="transform" :data-shape-id="shape.id">
    <rect
      v-if="shape.type === 'rectangle' || shape.type === 'square' || shape.type === 'rounded'"
      :x="shape.x"
      :y="shape.y"
      :width="shape.w"
      :height="shape.h"
      :rx="shape.type === 'rounded' ? 20 : 8"
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
    <polygon
      v-else-if="shape.type === 'pentagon' || shape.type === 'hexagon' || shape.type === 'arrow'"
      :points="polygonPoints"
      :fill="fill"
      :fill-opacity="shape.opacity"
      :stroke="border.color"
      :stroke-width="border.width"
      :stroke-dasharray="dashArray"
    />
    <polygon
      v-else-if="shape.type === 'star'"
      :points="starPoints"
      :fill="fill"
      :fill-opacity="shape.opacity"
      :stroke="border.color"
      :stroke-width="border.width"
      :stroke-dasharray="dashArray"
    />
    <g v-else-if="shape.type === 'cylinder'">
      <path
        :d="cylinderBody"
        :fill="fill"
        :fill-opacity="shape.opacity"
        :stroke="border.color"
        :stroke-width="border.width"
        :stroke-dasharray="dashArray"
      />
      <path
        :d="`M ${shape.x} ${shape.y + cylinderRy} A ${shape.w / 2} ${cylinderRy} 0 0 1 ${shape.x + shape.w} ${shape.y + cylinderRy}`"
        fill="none"
        :stroke="border.color"
        :stroke-width="border.width"
        :stroke-dasharray="dashArray"
      />
    </g>
    <path
      v-else-if="shape.type === 'callout'"
      :d="calloutPath"
      :fill="fill"
      :fill-opacity="shape.opacity"
      :stroke="border.color"
      :stroke-width="border.width"
      :stroke-dasharray="dashArray"
    />
    <image
      v-else-if="shape.type === 'image'"
      :href="shape.src"
      :x="shape.x"
      :y="shape.y"
      :width="shape.w"
      :height="shape.h"
      :opacity="shape.opacity"
      preserveAspectRatio="xMidYMid meet"
    />

    <!-- Rich text (HTML) — hidden while this shape is being edited. -->
    <foreignObject
      v-if="!isEditingThis && richHtml"
      :x="textArea.x"
      :y="textArea.y"
      :width="textArea.w"
      :height="textArea.h"
      style="overflow: visible"
    >
      <div class="fd-richtext" :style="richStyle" v-html="richHtml" />
    </foreignObject>

    <!-- Legacy plain text (shapes saved before rich text). -->
    <text
      v-else-if="!isEditingThis && shape.text?.content"
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
      :font-family="textStyle.font || 'Inter, sans-serif'"
    >
      {{ shape.text.content }}
    </text>
  </g>
</template>
