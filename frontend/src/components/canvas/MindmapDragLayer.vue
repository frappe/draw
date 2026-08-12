<script setup>
// What a mind-map node drag looks like (#427 item 4). A thin renderer over the
// drag composable's state: the node's subtree drawn faintly at the pointer, and an
// indicator for the slot it will land in — a bar across the gap between two
// siblings, or a ring round the parent it will be appended to.
//
// Nothing here decides anything: slots, hit-testing and the drop rule all live in
// the pure mindmapDrop module. Non-interactive throughout, so the gesture's own
// window listeners keep seeing every pointer event.
import { computed } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useMindmapNodeDrag } from '@/composables/useMindmapNodeDrag.js'
import { contextWithout, indicatorFor } from '@/diagram/mindmapDrop.js'
import { cornerRadiusOf } from '@/diagram/shapeGeometry.js'
import { mindmapModelFromShapes } from '@/diagram/freeFloatingGraph.js'
import { subtreeIds } from '@/diagram/mindmapModel.js'

const store = useDiagramStore()
const drag = useMindmapNodeDrag()

const active = computed(() => drag.state.active && !!drag.state.nodeId)

// The dragged node and everything under it — a branch travels as a unit.
const ghosts = computed(() => {
  if (!active.value) return []
  const model = mindmapModelFromShapes(store.state.shapes)
  const ids = new Set(subtreeIds(model, drag.state.nodeId))
  return store.state.shapes.filter((shape) => ids.has(shape.id))
})

const indicator = computed(() => {
  if (!active.value || !drag.state.slot) return null
  const context = contextWithout(store.state.shapes, drag.state.nodeId)
  return indicatorFor(drag.state.slot, context)
})

const DROP_COLOR = '#006EDB'
</script>

<template>
  <g data-mindmap-drag-layer style="pointer-events: none">
    <rect
      v-for="ghost in ghosts"
      :key="ghost.id"
      :x="ghost.x + drag.state.dx"
      :y="ghost.y + drag.state.dy"
      :width="ghost.w"
      :height="ghost.h"
      :rx="cornerRadiusOf(ghost)"
      :fill="ghost.fill || '#F3F3F3'"
      fill-opacity="0.45"
      :stroke="ghost.border?.color || '#C7C7C7'"
      stroke-width="1.5"
      stroke-opacity="0.6"
    />
    <line
      v-if="indicator?.kind === 'bar'"
      :x1="indicator.x1"
      :y1="indicator.y1"
      :x2="indicator.x2"
      :y2="indicator.y2"
      :stroke="DROP_COLOR"
      stroke-width="3"
      stroke-linecap="round"
    />
    <rect
      v-if="indicator?.kind === 'ring'"
      :x="indicator.x - 3"
      :y="indicator.y - 3"
      :width="indicator.w + 6"
      :height="indicator.h + 6"
      rx="10"
      fill="none"
      :stroke="DROP_COLOR"
      stroke-width="2"
    />
  </g>
</template>
