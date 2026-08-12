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
  ADD_HIT_R,
  GLYPH,
  buildContext,
  handlesForNode,
  shouldShowHandles,
  nextHoverTarget,
  hoverStripsOf,
  previewBoxFor,
} from '@/diagram/mindmapHandles.js'
import { NODE_GRAY } from '@/diagram/espressoPalette.js'
import { curveRadius } from '@/diagram/mindmapNodeStyle.js'
import { useAppSettings } from '@/composables/useAppSettings.js'
import { useMindmapNodeDrag } from '@/composables/useMindmapNodeDrag.js'

const store = useDiagramStore()
const editorUi = useEditorUi()
const drag = useMindmapNodeDrag()

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

// Hover tracking lives in the pure state machine, which knows that a "+" belongs
// to the node that offered it — so travelling toward a handle never hands the
// hover to whatever else the pointer passes over (#427 item 1).
function onPointerMove(event) {
  clearPendingLeave()
  if (!hasNodes.value || !selectTool.value) {
    hoveredId.value = null
    return
  }
  hoveredId.value = nextHoverTarget({
    point: toLogical(event),
    currentId: hoveredId.value,
    ctx: ctx.value,
    shapes: store.state.shapes,
  })
}

// Leaving the SVG drops the hover, but only after a beat. The canvas SVG is
// pointer-events:none with only its painted children interactive, so this event
// also fires for the odd frame where the pointer is between two painted things —
// dropping the column right then is exactly the "+ vanished as I reached for it"
// bug. A real departure has no follow-up pointermove and clears normally.
const LEAVE_GRACE_MS = 120
let leaveTimer = null

function clearPendingLeave() {
  if (leaveTimer) clearTimeout(leaveTimer)
  leaveTimer = null
}

function onPointerLeave() {
  clearPendingLeave()
  leaveTimer = setTimeout(() => {
    hoveredId.value = null
    leaveTimer = null
  }, LEAVE_GRACE_MS)
}

onMounted(() => {
  svg = layer.value?.ownerSVGElement
  if (!svg) return
  svg.addEventListener('pointermove', onPointerMove)
  svg.addEventListener('pointerleave', onPointerLeave)
})

onBeforeUnmount(() => {
  clearPendingLeave()
  if (!svg) return
  svg.removeEventListener('pointermove', onPointerMove)
  svg.removeEventListener('pointerleave', onPointerLeave)
})

// The nodes that should show handles right now: the hovered one AND the sole
// selection (#261 — a selected node surfaces its add CTAs), deduped via the pure
// predicate.
const targetIds = computed(() => {
  // A drag is already showing where the node will land; a column of "+" marks
  // under the ghost would just be competing for the same attention (#427).
  if (drag.state.active) return []
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

// The corridor to either side of the hovered node, painted transparent so the
// pointer always has something under it on its way to a "+" (#427 item 1). The
// canvas SVG only receives pointer events over painted children, so that gap used
// to be dead space: no pointermove fired, and crossing it read as leaving the SVG.
// The node's own box is deliberately left out — a sheet over it would swallow the
// I-beam zone and the link badge. Presses here fall through to the canvas, which
// hit-tests by geometry, so a marquee started in the corridor still behaves.
const hoverCorridor = computed(() =>
  hoveredId.value ? hoverStripsOf(hoveredId.value, ctx.value) : [],
)

// The "+" is drawn in the neutral default node colour, never the node's own custom
// colour (#427 item 2). A new node is always created with the default look, so a
// coloured parent tinting its "+" promised a colour the node would not have.
const HANDLE_COLOR = NODE_GRAY.border
const HANDLE_INK = '#6B7280'

// The handle the pointer is resting on, and the ghost of the node it would create.
// The ghost is drawn at the DEFAULT size and look — the same monochrome box the
// click produces — so the preview never over-promises (#427 item 2).
const hoveredHandleKey = ref(null)
const childCurve = computed(
  () => useAppSettings().settings.mindmapNodeStyle?.child?.curve || 'moderate',
)
const preview = computed(() => {
  const handle = handles.value.find((candidate) => candidate.key === hoveredHandleKey.value)
  if (!handle) return null
  const box = previewBoxFor(handle, ctx.value)
  return box ? { ...box, rx: curveRadius(childCurve.value, box.h) } : null
})

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
    <!-- The hover corridor: invisible, but painted, so the pointer never crosses
         dead canvas on its way from the node to a "+". -->
    <rect
      v-for="(strip, index) in hoverCorridor"
      :key="`corridor-${index}`"
      :x="strip.x"
      :y="strip.y"
      :width="strip.w"
      :height="strip.h"
      fill="transparent"
      style="cursor: inherit"
    />
    <!-- One "+" per handle. pointerdown is stopped so pressing a "+" never starts a
         marquee or clears the selection; the click adds. The hit circle is a plain
         transparent disc wider than the mark, so the target is generous while the
         mark stays small; the stub and glyph are non-interactive. -->
    <!-- The node this "+" would create, ghosted at its real default size and look. -->
    <rect
      v-if="preview"
      :x="preview.x"
      :y="preview.y"
      :width="preview.w"
      :height="preview.h"
      :rx="preview.rx"
      :fill="NODE_GRAY.fill"
      fill-opacity="0.5"
      :stroke="NODE_GRAY.border"
      stroke-width="1.5"
      stroke-dasharray="4 4"
      style="pointer-events: none"
    />
    <g
      v-for="handle in handles"
      :key="handle.key"
      style="cursor: pointer"
      @click.stop="add(handle)"
      @pointerdown.stop
      @pointerenter="hoveredHandleKey = handle.key"
      @pointerleave="hoveredHandleKey === handle.key && (hoveredHandleKey = null)"
    >
      <title>Add node</title>
      <path
        v-if="handle.straight"
        :d="stubPath(handle)"
        :stroke="HANDLE_COLOR"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-dasharray="2 3"
        fill="none"
        style="pointer-events: none"
      />
      <circle :cx="handle.cx" :cy="handle.cy" :r="ADD_HIT_R" fill="transparent" />
      <!-- A white disc under the mark so a branch curve passing behind the handle
           reads as passing behind it, instead of through the "+" (#427 item 7). -->
      <circle
        :cx="handle.cx"
        :cy="handle.cy"
        :r="ADD_R"
        fill="#FFFFFF"
        :stroke="HANDLE_COLOR"
        stroke-width="1.25"
        style="pointer-events: none"
      />
      <path
        :d="glyphPath(handle)"
        :stroke="HANDLE_INK"
        stroke-width="1.5"
        stroke-linecap="round"
        fill="none"
        style="pointer-events: none"
      />
    </g>
  </g>
</template>
