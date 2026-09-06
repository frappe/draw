<script setup>
// On-canvas "+" add-handle for MIGRATED flowchart nodes (issue #77, the flowchart
// counterpart of the mind-map "+" handles from #118). After the free-floating
// refactor (#122) a flowchart node is an ordinary shape with role 'flowchart-node';
// keyboard add already works (D/T/I drop a typed step below), but mouse users had no
// affordance. This overlay gives them the same on-canvas "+" FlowchartLayer.vue
// draws for legacy charts: a single "+" reveals below a node while it is hovered or
// the sole selection (select tool only), and clicking it opens the node-type picker
// so the step added below is the type the user actually wants (#410).
//
// It mirrors MindmapHoverHandles.vue: a <g> inside the viewport transform that
// listens on the canvas SURFACE, converts the pointer to logical canvas units via
// the group's CTM, and renders SVG affordances in those units — so the handle's
// hit-area lines up with the drawn "+". Listening on the surface rather than the
// SVG is load-bearing; see onMounted. All placement/visibility logic lives in the pure, unit-tested
// flowchartHandles.js; this file only renders + wires the click to the existing
// store op (it never reimplements the add). It is a no-op when there are no migrated
// flowchart shapes, so legacy single-type flowcharts (which still render via
// FlowchartLayer from the non-null state.flowchart) are untouched.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { textWidth } from '@/diagram/textMetrics.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { openFlowchartPicker, closeFlowchartPicker } from '@/stores/flowchartUi.js'
import {
  ADD_R,
  ADD_HIT_R,
  GLYPH,
  buildContext,
  handleAtPoint,
  handlesForNode,
  shouldShowHandles,
  nextHoverTarget,
} from '@/diagram/flowchartHandles.js'

const store = useDiagramStore()
const editorUi = useEditorUi()

const layer = ref(null)
let svg = null
let surface = null

// The migrated flowchart index, rebuilt whenever shapes or connectors change. The
// connectors are what tell a node which of its sides are already spoken for, so a
// "+" only ever marks a direction a new flow can actually take (#549).
const ctx = computed(() => buildContext(store.state.shapes, store.state.connectors))
const hasNodes = computed(() => Object.keys(ctx.value.boxes).length > 0)
const selectTool = computed(() => editorUi.state.tool === 'select')

// The flowchart node the cursor is over (or reaching toward). Only the select tool
// drives it — the "+" is a select-mode affordance, like FlowchartLayer's.
const hoveredId = ref(null)
// The single handle the pointer is aiming at, which is drawn emphasised. Aiming is
// forgiving (the hit radius is far wider than the mark), so the user needs telling
// WHICH direction the press they are about to make will take (#549 item 1).
const aimedKey = ref(null)

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

// Hover tracking goes through the pure state machine, which knows that a "+"
// belongs to the node that offered it — so travelling toward a handle never hands
// the hover to whatever else the pointer passes over.
function onPointerMove(event) {
  clearPendingLeave()
  if (!hasNodes.value || !selectTool.value) {
    hoveredId.value = null
    aimedKey.value = null
    return
  }
  const point = toLogical(event)
  hoveredId.value = nextHoverTarget({
    point,
    currentId: hoveredId.value,
    ctx: ctx.value,
    shapes: store.state.shapes,
  })
  const aimed = hoveredId.value ? handleAtPoint(point, hoveredId.value, ctx.value) : null
  aimedKey.value = aimed?.key || null
}

// Leaving the surface drops the hover, but only after a beat, so a frame's worth of
// pointer noise between two elements cannot make the "+" flicker. A real departure
// has no follow-up pointermove and clears normally.
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
    aimedKey.value = null
    leaveTimer = null
  }, LEAVE_GRACE_MS)
}

onMounted(() => {
  svg = layer.value?.ownerSVGElement
  // The canvas SURFACE, not the SVG — and this is the whole hover bug. The canvas
  // <svg> is pointer-events:none with only its painted children interactive, so the
  // empty space between a node and its "+" reports nothing to it. Worse, moving off
  // the node into that gap fires `pointerleave` on the SVG, which cleared the hover
  // outright: the handle vanished at the exact moment the user set off toward it.
  // The surface spans the whole canvas, so the gap is just more surface, and events
  // over the shapes still bubble up to it.
  surface = svg?.closest('[role="application"]') || svg
  if (!surface) return
  surface.addEventListener('pointermove', onPointerMove)
  surface.addEventListener('pointerleave', onPointerLeave)
})

onBeforeUnmount(() => {
  clearPendingLeave()
  // Leaving the canvas with a menu open would strand it, since the component that
  // renders it lives outside this overlay's lifetime.
  closeFlowchartPicker()
  if (!surface) return
  surface.removeEventListener('pointermove', onPointerMove)
  surface.removeEventListener('pointerleave', onPointerLeave)
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

// One neutral colour for every "+", not the source node's border colour (#441 item
// 12, mirroring #427 item 2). A new node is always created with the default look, so
// a coloured parent tinting its "+" promised a colour the node would not have.
const HANDLE_COLOR = '#A1A1A1'
const HANDLE_INK = '#6B7280'
// The one the pointer is aiming at darkens and grows a little, so a forgiving hit
// area still says exactly which direction a press would take (#549 item 1).
const AIMED_COLOR = '#525252'
const AIMED_GROWTH = 1.5

function isAimed(handle) {
  return handle.key === aimedKey.value
}
function markRadius(handle) {
  return isAimed(handle) ? ADD_R + AIMED_GROWTH : ADD_R
}
function markColor(handle) {
  return isAimed(handle) ? AIMED_COLOR : HANDLE_COLOR
}
function inkColor(handle) {
  return isAimed(handle) ? AIMED_COLOR : HANDLE_INK
}

// The "+" glyph centred in a handle circle.
function glyphPath(handle) {
  return `M${handle.cx - GLYPH} ${handle.cy} H${handle.cx + GLYPH} M${handle.cx} ${handle.cy - GLYPH} V${handle.cy + GLYPH}`
}

// Clicking a "+" opens the node-type menu (the full standard set, spec B3/B4) at
// that handle instead of silently dropping a fixed Process step — a plain click no
// longer forces every added node down one type (#410).
//
// The menu itself is rendered by FlowchartNodeTypeMenu, OUTSIDE the canvas <svg>;
// this overlay only records which node it belongs to and where that node is on
// screen (#441 item 10). It cannot render the menu here: Vue creates elements in
// the namespace of the surrounding template, so a <div> declared inside this SVG
// is built as an SVG-namespaced div with no CSS box — `position: fixed` never
// applies and the menu collapses to zero width. A <Teleport> relocates such a node
// but cannot change the namespace it was created in.
function openPicker(handle) {
  // The branch this handle belongs to travels with the request, so choosing a type
  // from a decision's "No" handle extends the No branch rather than whichever one
  // happened to be free next.
  openFlowchartPicker(handle.nodeId, screenBoxOf(handle.nodeId), handle.port, handle.side)
}

// A decision's handles preview the branch they would create ("Yes", "No", …).
//
// The pill sits OUTSIDE its own "+", further along the direction that branch would
// travel — below a bottom handle, right of a right handle, and so on. Each branch
// now owns a whole side (#549 item 3), so pushing the pill outward is what keeps it
// off the node, off the connectors already leaving the other sides, and off the
// branch that was created before it.
const LABEL_DROP = 15
const LABEL_H = 17
function labelBox(handle) {
  const w = labelWidth(handle)
  if (handle.side === 'top') return { x: handle.cx - w / 2, y: handle.cy - LABEL_DROP - LABEL_H, w, h: LABEL_H }
  if (handle.side === 'right') return { x: handle.cx + LABEL_DROP, y: handle.cy - LABEL_H / 2, w, h: LABEL_H }
  if (handle.side === 'left') return { x: handle.cx - LABEL_DROP - w, y: handle.cy - LABEL_H / 2, w, h: LABEL_H }
  return { x: handle.cx - w / 2, y: handle.cy + LABEL_DROP, w, h: LABEL_H }
}
// Measured, not estimated: textMetrics.textWidth exists for exactly this, and a
// per-character average sized the pill wrong for anything but lowercase ASCII — a
// branch renamed to "Needs review" or "承認" got a pill that did not fit its text.
// The 14px is padding either side of whatever it measures.
const LABEL_FONT = { size: 11, font: 'Inter, sans-serif' }
const LABEL_PAD = 14
function labelWidth(handle) {
  if (!handle.label) return LABEL_PAD
  // textWidth is 0 without a canvas, so keep a character-count floor rather than
  // letting the pill collapse to its padding.
  const measured = textWidth(handle.label, LABEL_FONT)
  return Math.ceil(Math.max(measured, handle.label.length * 5.5)) + LABEL_PAD
}

// The source node's box in SCREEN pixels, straight off its rendered group — so the
// anchor already accounts for pan and zoom without re-deriving the transform.
function screenBoxOf(nodeId) {
  const node = document.querySelector(`[data-shape-id="${CSS.escape(nodeId)}"]`)
  if (!node) return null
  const rect = node.getBoundingClientRect()
  return { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
}

</script>

<template>
  <g ref="layer" data-flowchart-hover-handles>
    <!-- One "+" per handle. pointerdown is stopped so pressing a "+" never starts a
         marquee or clears the selection; the click opens the type picker. The hit
         circle is a plain transparent disc wider than the mark, so the target is
         generous while the mark stays small; the stub and glyph are
         non-interactive. -->
    <g
      v-for="handle in handles"
      :key="handle.key"
      style="cursor: pointer"
      @click.stop="openPicker(handle)"
      @pointerdown.stop
      @mousedown.stop
    >
      <title>{{ handle.label ? `Add step on "${handle.label}"` : 'Add step' }}</title>
      <!-- A decision previews the branch each handle would extend, so the user can
           see that Yes goes down and No goes right before committing to either. -->
      <g v-if="handle.label" style="pointer-events: none">
        <rect
          :x="labelBox(handle).x"
          :y="labelBox(handle).y"
          :width="labelBox(handle).w"
          :height="labelBox(handle).h"
          rx="8"
          fill="#FFFFFF"
          :stroke="markColor(handle)"
          stroke-width="1"
        />
        <text
          :x="labelBox(handle).x + labelBox(handle).w / 2"
          :y="labelBox(handle).y + labelBox(handle).h / 2"
          text-anchor="middle"
          dominant-baseline="central"
          font-size="11"
          font-family="Inter, sans-serif"
          :fill="inkColor(handle)"
        >
          {{ handle.label }}
        </text>
      </g>
      <line
        :x1="handle.stubX"
        :y1="handle.stubY"
        :x2="handle.cx"
        :y2="handle.cy"
        :stroke="markColor(handle)"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-dasharray="2 3"
        style="pointer-events: none"
      />
      <circle :cx="handle.cx" :cy="handle.cy" :r="ADD_HIT_R" fill="transparent" />
      <!-- A white disc under the mark so a connector passing behind the handle
           reads as passing behind it, instead of through the "+". -->
      <circle
        :cx="handle.cx"
        :cy="handle.cy"
        :r="markRadius(handle)"
        fill="#FFFFFF"
        :stroke="markColor(handle)"
        stroke-width="1.25"
        style="pointer-events: none"
      />
      <path
        :d="glyphPath(handle)"
        :stroke="inkColor(handle)"
        stroke-width="1.5"
        stroke-linecap="round"
        fill="none"
        style="pointer-events: none"
      />
    </g>

  </g>
</template>
