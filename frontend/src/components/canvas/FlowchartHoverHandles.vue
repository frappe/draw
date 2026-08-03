<script setup>
// On-canvas "+" add-handle for MIGRATED flowchart nodes (issue #77, the flowchart
// counterpart of the mind-map "+" handles from #118). After the free-floating
// refactor (#122) a flowchart node is an ordinary shape with role 'flowchart-node';
// keyboard add already works (D/T/I drop a typed step below), but mouse users had no
// affordance. This overlay gives them the same on-canvas "+" FlowchartLayer.vue
// draws for legacy charts: a single "+" reveals below a node while it is hovered or
// the sole selection (select tool only), and clicking it adds a Process step below.
//
// It mirrors MindmapHoverHandles.vue exactly — the same HoverArrows.vue structure: a
// <g> inside the viewport transform that attaches a pointermove listener to the SVG
// surface, converts the pointer to logical canvas units via the group's CTM, and
// renders SVG affordances in those units — so the handle's hit-area lines up with
// the drawn "+". All placement/visibility logic lives in the pure, unit-tested
// flowchartHandles.js; this file only renders + wires the click to the existing
// store op (it never reimplements the add). It is a no-op when there are no migrated
// flowchart shapes, so legacy single-type flowcharts (which still render via
// FlowchartLayer from the non-null state.flowchart) are untouched.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import {
  ADD_R,
  GLYPH,
  buildContext,
  handlesForNode,
  shouldShowHandles,
  nodeAtPoint,
  hoverRegionOf,
  pointInBox,
} from '@/diagram/flowchartHandles.js'

const store = useDiagramStore()
const editorUi = useEditorUi()

const layer = ref(null)
let svg = null

// The migrated flowchart index (boxes by id), rebuilt whenever shapes change.
const ctx = computed(() => buildContext(store.state.shapes))
const hasNodes = computed(() => Object.keys(ctx.value.boxes).length > 0)
const selectTool = computed(() => editorUi.state.tool === 'select')

// The flowchart node the cursor is over (or reaching toward). Only the select tool
// drives it — the "+" is a select-mode affordance, like FlowchartLayer's.
const hoveredId = ref(null)

// Convert a pointer event into logical canvas units via the group CTM (HoverArrows).
function toLogical(event) {
  const ctm = layer.value?.getScreenCTM()
  if (!ctm) return { x: 0, y: 0 }
  const point = svg.createSVGPoint()
  point.x = event.clientX
  point.y = event.clientY
  const local = point.matrixTransform(ctm.inverse())
  return { x: local.x, y: local.y }
}

// Hover tracking: the node the pointer is directly over wins; failing that, the
// current node stays hovered while the pointer is within its padded region, so the
// handle doesn't vanish as the cursor slides off the node's bottom edge toward the "+".
function onPointerMove(event) {
  if (!hasNodes.value || !selectTool.value) {
    hoveredId.value = null
    return
  }
  const point = toLogical(event)
  const hit = nodeAtPoint(point, store.state.shapes)
  if (hit) {
    hoveredId.value = hit
    return
  }
  if (hoveredId.value) {
    const region = hoverRegionOf(hoveredId.value, ctx.value)
    if (!pointInBox(point, region)) hoveredId.value = null
  }
}

function onPointerLeave() {
  hoveredId.value = null
}

onMounted(() => {
  svg = layer.value?.ownerSVGElement
  if (!svg) return
  svg.addEventListener('pointermove', onPointerMove)
  svg.addEventListener('pointerleave', onPointerLeave)
})

onBeforeUnmount(() => {
  if (!svg) return
  svg.removeEventListener('pointermove', onPointerMove)
  svg.removeEventListener('pointerleave', onPointerLeave)
})

// The nodes that should show a handle right now: the hovered one AND the sole
// selection (both, like FlowchartLayer.isActive), deduped via the pure predicate.
const targetIds = computed(() => {
  const selection = store.state.selection
  const sole = selection.length === 1 ? selection[0] : null
  return Object.keys(ctx.value.boxes).filter((id) =>
    shouldShowHandles({
      hovered: hoveredId.value === id,
      soleSelected: sole === id,
      selectTool: selectTool.value,
    }),
  )
})

const handles = computed(() => targetIds.value.flatMap((id) => handlesForNode(id, ctx.value)))

// The "+" takes the node's own border colour so it reads as part of the node,
// exactly like the mind-map handles tint their circle with the node colour.
function colorOf(nodeId) {
  return store.shapeById(nodeId)?.border?.color || '#525252'
}

// The white "+" glyph centred in a handle circle.
function glyphPath(handle) {
  return `M${handle.cx - GLYPH} ${handle.cy} H${handle.cx + GLYPH} M${handle.cx} ${handle.cy - GLYPH} V${handle.cy + GLYPH}`
}

// Add a connected Process step through the existing representation-aware store op,
// then select it so its own handle appears (ready to keep adding). The op builds the
// tagged shape + flow-edge connector and commits as one undoable unit; a decision
// parent is routed through its next free Yes/No branch inside the op.
function add(handle) {
  const id = store.addFlowchartChildShape(handle.nodeId, 'process')
  if (id) store.select([id])
}
</script>

<template>
  <g ref="layer" data-flowchart-hover-handles>
    <!-- One "+" per handle. pointerdown is stopped so pressing a "+" never starts a
         marquee or clears the selection; the click adds. The stub line and glyph are
         non-interactive, so the hit-area is exactly the visible circle. -->
    <g
      v-for="handle in handles"
      :key="handle.key"
      style="cursor: pointer"
      @click.stop="add(handle)"
      @pointerdown.stop
    >
      <title>Add step</title>
      <line
        :x1="handle.stubX"
        :y1="handle.stubY"
        :x2="handle.cx"
        :y2="handle.cy"
        :stroke="colorOf(handle.nodeId)"
        stroke-width="2"
        stroke-linecap="round"
        style="pointer-events: none"
      />
      <circle :cx="handle.cx" :cy="handle.cy" :r="ADD_R" :fill="colorOf(handle.nodeId)" />
      <path
        :d="glyphPath(handle)"
        stroke="#FFFFFF"
        stroke-width="1.8"
        stroke-linecap="round"
        fill="none"
        style="pointer-events: none"
      />
    </g>
  </g>
</template>
