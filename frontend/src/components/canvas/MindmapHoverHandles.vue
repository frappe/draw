<script setup>
// On-canvas "+" add-handles for MIGRATED mind-map nodes (issue #118, the "+"-handles
// part). After the free-floating refactor (#122) a mind-map node is an ordinary shape
// with role 'mindmap-node'; keyboard add already works (Tab=child, Enter=sibling), but
// mouse users had no affordance. This overlay gives them an on-canvas gap-insertion
// column (#265/#264): while a node is hovered (select tool only) a "+" reveals for
// every slot a new child could take — above the top child, below the bottom one, and
// in each gap between — and clicking one inserts a child at that ordinal and re-flows
// the tree. A root offers a column on both sides; any other node only on its branch
// side; a childless node offers a single "+" at its own mid-height.
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
// selection (#261 — a selected node surfaces its add CTAs), deduped via the pure
// predicate.
const targetIds = computed(() => {
  const selection = store.state.selection || []
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

// The dotted stub from the node's edge (at its mid-height) out to the "+": a smooth
// cubic for a gap handle offset above/below the mid, a straight dash for the lone
// childless-node handle sitting level with the edge. Control points share each
// endpoint's y so the curve leaves the node and eases into the "+" horizontally.
function stubPath(handle) {
  const { stubX: sx, stubY: sy, cx: hx, cy: hy } = handle
  if (handle.straight) return `M${sx} ${sy} L${hx} ${hy}`
  const mx = (sx + hx) / 2
  return `M${sx} ${sy} C${mx} ${sy} ${mx} ${hy} ${hx} ${hy}`
}

// Insert a child at the clicked gap through the existing store op, which opens the
// ordinal slot, re-flows the tree, and selects the new node so its own handles
// appear (ready to keep adding) — all as one undoable unit.
function add(handle) {
  store.addChildNodeAt(handle.nodeId, handle.side, handle.index)
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
      <title>Add node</title>
      <path
        :d="stubPath(handle)"
        :stroke="colorOf(handle.nodeId)"
        stroke-width="2"
        stroke-linecap="round"
        stroke-dasharray="2 3"
        fill="none"
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
