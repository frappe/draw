<script setup>
// On-canvas "+" add-handles for MIGRATED mind-map nodes (issue #118, the "+"-handles
// part). After the free-floating refactor (#122) a mind-map node is an ordinary shape
// with role 'mindmap-node'; keyboard add already works (Tab=child, Enter=sibling), but
// mouse users had no affordance. This overlay gives them the same on-canvas "+" the
// legacy MindMapNodeLayer.vue draws: a "+" reveals next to a node while it is hovered
// or the sole selection (select tool only), and clicking it adds — a root grows a
// child on either side, any other node grows a child on its branch side or a sibling
// just below.
//
// It mirrors HoverArrows.vue's structure: a <g> inside the viewport transform that
// attaches a pointermove listener to the SVG surface, converts the pointer to logical
// canvas units via the group's CTM, and renders SVG affordances in those units — so a
// handle's hit-area lines up with the drawn "+". All placement/side/visibility logic
// lives in the pure, unit-tested mindmapHandles.js; this file only renders + wires
// clicks to the existing store ops (it never reimplements the add). It is a no-op when
// there are no migrated mind-map shapes, so legacy single-type mind maps (which still
// render via MindMapNodeLayer from the non-null state.mindmap) are untouched.
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
} from '@/diagram/mindmapHandles.js'

const store = useDiagramStore()
const editorUi = useEditorUi()

const layer = ref(null)
let svg = null

// The reconstructed mind-map index (tree + boxes), rebuilt whenever shapes change.
const ctx = computed(() => buildContext(store.state.shapes, store.state.connectors))
const hasNodes = computed(() => Object.keys(ctx.value.boxes).length > 0)
const selectTool = computed(() => editorUi.state.tool === 'select')

// The mind-map node the cursor is over (or reaching toward). Only the select tool
// drives it — the "+" is a select-mode affordance, like MindMapNodeLayer's.
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
// handles don't vanish as the cursor slides off the node toward a "+".
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

// The nodes that should show handles right now: the hovered one AND the sole
// selection (both, like MindMapNodeLayer.showAdd), deduped via the pure predicate.
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

// The "+" takes the node's own branch colour (its border) so it reads as part of the
// branch, exactly like MindMapNodeLayer tints its buttons with the node colour.
function colorOf(nodeId) {
  return store.shapeById(nodeId)?.border?.color || '#525252'
}

// The white "+" glyph centred in a handle circle.
function glyphPath(handle) {
  return `M${handle.cx - GLYPH} ${handle.cy} H${handle.cx + GLYPH} M${handle.cx} ${handle.cy - GLYPH} V${handle.cy + GLYPH}`
}

// Add a child / a sibling through the existing representation-aware store ops, then
// select the new node so its own handles appear (ready to keep adding). The ops
// build the tagged shape + branch connector and commit as one undoable unit.
function add(handle) {
  const newId =
    handle.kind === 'child'
      ? store.addChildNode(handle.nodeId, handle.side)
      : store.addSiblingNode(handle.nodeId)
  if (newId) store.select([newId])
}
</script>

<template>
  <g ref="layer" data-mindmap-hover-handles>
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
      <title>{{ handle.kind === 'child' ? 'Add child' : 'Add sibling' }}</title>
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
