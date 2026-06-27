<script setup>
// One straight whiteboard line with selectable endpoints (spec diagram-types
// Part C). Pure render — selection is driven by the surface select hit-test
// (useWhiteboardInteraction.selectAt), which picks the line under the cursor and
// flips ui.state.selected. Endpoints (none/arrow/dot) are drawn inline so each
// line keeps its own color without per-color SVG marker defs.
import { computed } from 'vue'

const props = defineProps({
  line: { type: Object, required: true },
  selected: { type: Boolean, default: false },
})

// Arrow-head / dot size scales mildly with the line width so thick lines read.
const markerSize = computed(() => 7 + props.line.width * 1.4)

// Unit direction A→B (zero-safe). Endpoints orient along this.
const unit = computed(() => {
  const dx = props.line.x2 - props.line.x1
  const dy = props.line.y2 - props.line.y1
  const length = Math.hypot(dx, dy) || 1
  return { x: dx / length, y: dy / length }
})

// Triangle points for an arrow head at one end, pointing outward.
function arrowPoints(tipX, tipY, dirX, dirY) {
  const size = markerSize.value
  const perpX = -dirY
  const perpY = dirX
  const baseX = tipX - dirX * size
  const baseY = tipY - dirY * size
  const half = size * 0.5
  return [
    `${tipX},${tipY}`,
    `${baseX + perpX * half},${baseY + perpY * half}`,
    `${baseX - perpX * half},${baseY - perpY * half}`,
  ].join(' ')
}

const endArrow = computed(() =>
  props.line.end === 'arrow' ? arrowPoints(props.line.x2, props.line.y2, unit.value.x, unit.value.y) : null,
)
const startArrow = computed(() =>
  props.line.start === 'arrow' ? arrowPoints(props.line.x1, props.line.y1, -unit.value.x, -unit.value.y) : null,
)
const dotRadius = computed(() => props.line.width * 1.4 + 1.5)
</script>

<template>
  <g :style="selected ? 'filter: drop-shadow(0 0 2px #006EDB)' : null">
    <line
      :x1="line.x1"
      :y1="line.y1"
      :x2="line.x2"
      :y2="line.y2"
      :stroke="line.color"
      :stroke-width="line.width"
      stroke-linecap="round"
    />
    <polygon v-if="startArrow" :points="startArrow" :fill="line.color" />
    <polygon v-if="endArrow" :points="endArrow" :fill="line.color" />
    <circle v-if="line.start === 'dot'" :cx="line.x1" :cy="line.y1" :r="dotRadius" :fill="line.color" />
    <circle v-if="line.end === 'dot'" :cx="line.x2" :cy="line.y2" :r="dotRadius" :fill="line.color" />
  </g>
</template>
