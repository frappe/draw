<script setup>
// Flowchart render layer (spec diagram-types Part B, F1-F5). Draws the typed
// node shapes (terminator/process/decision/inputOutput/connector), orthogonal
// arrowed edges with branch labels near the source, the "+" extend handles on the selected /
// hovered node (decision shows one per labelled branch), inline text editing, the
// drag-to-empty connector preview, and the node-type picker overlay.
//
// Rendered inside the canvas viewport <g>, so all geometry is in canvas units
// (Part G4). This component instantiates the flowchart interaction composable so
// its pointer handlers are registered into the shared modeInteraction seam — the
// canvas only mounts this layer for flowchart diagrams (Part G1).
import { computed, inject, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useFlowchartInteraction } from '@/composables/useFlowchartInteraction.js'
import { flowchartUi, endFlowchartEdit } from '@/stores/flowchartUi.js'
import { primaryTriad } from '@/diagram/theme.js'
import { nodeSize } from '@/diagram/flowchartModel.js'
import { nodeShape } from '@/diagram/flowchartShapes.js'
import {
  routeEdge,
  routeOffsets,
  pointsToPath,
  portPoint,
  branchInfoFor,
} from '@/diagram/flowchartLayout.js'
import FlowchartNodeTypePicker from './FlowchartNodeTypePicker.vue'
import SmartGuidesLayer from './SmartGuidesLayer.vue'

const props = defineProps({
  flowchart: { type: Object, required: true },
})

const store = useDiagramStore()
const editorUi = useEditorUi()
const interactionRef = inject('modeInteraction', null)
const { ui, chooseNodeType, closePicker, cancel } = useFlowchartInteraction(
  store,
  editorUi,
  interactionRef,
)

// Escape cancels a pending connector drag or the open node-type picker (P12), so
// a half-drawn connector never sticks to the cursor with no way to bail out.
function onKeyDown(event) {
  if (event.key === 'Escape' && (ui.pendingLink || ui.picker)) cancel()
}
onMounted(() => window.addEventListener('keydown', onKeyDown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown))

const direction = computed(() => props.flowchart.direction || 'TB')
const triad = computed(() => primaryTriad(store.state.themePreset))

// Selection holds node ids in flowchart mode (may be many with multi-select).
const selectedIds = computed(() => store.state.selection)
// Inline editing lives in a shared store so any creation path (a "+" handle, a
// drag-to-empty drop, or the "add first step" prompt) can open the editor.
const editingId = computed(() => flowchartUi.editingId)
const editFields = ref({}) // node id -> the contenteditable element
const zoom = computed(() => editorUi.viewport.state.zoom || 1)

// When a node enters edit mode, move focus into its field and select the text
// (so the auto-populated default like "Process" is replaced as the user types).
watch(
  () => flowchartUi.editingId,
  (id) => {
    if (id) nextTick(() => focusField(id))
  },
)

function focusField(id) {
  const field = editFields.value[id]
  if (!field) return
  field.focus()
  const range = document.createRange()
  range.selectNodeContents(field)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
}

// Horizontal inset for the label: a diamond narrows toward top/bottom, so its
// text needs a wider margin than a rectangle to stay inside the shape.
function textInset(node) {
  return node.nodeType === 'decision' ? Math.round(nodeSize(node).w * 0.16) : 10
}

// Per-node text style (consistent with block/mind-map: size, bold, italic,
// alignment), applied to the wrapping label.
function labelStyle(node, ink) {
  const ts = node.textStyle || {}
  const align = ts.align || 'center'
  return {
    color: ink,
    fontSize: (ts.size || 14) + 'px',
    fontWeight: ts.bold ? 700 : 400,
    fontStyle: ts.italic ? 'italic' : 'normal',
    textDecoration: [ts.underline && 'underline', ts.strike && 'line-through'].filter(Boolean).join(' ') || 'none',
    textAlign: align,
    justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
  }
}
// Height of the junction's node-centred label box. Tall enough that wrapped text
// spills up/down past the small circle (P11); text beyond ±half of this clips.
const JUNCTION_LABEL_H = 220

function isSelected(id) {
  return selectedIds.value.includes(id)
}

// ----- nodes ----------------------------------------------------------------

const nodes = computed(() =>
  props.flowchart.nodes.map((node) => {
    const size = nodeSize(node)
    return {
      node,
      size,
      shape: nodeShape(node.nodeType, size.w, size.h),
      fill: node.fill || triad.value.fill,
      stroke: node.border || triad.value.stroke,
      ink: triad.value.ink,
    }
  }),
)

// "+" extend handles appear on hover, and on the selected node only when it's the
// sole selection — a multi-selection hides them (they act per-node, so showing
// them on every group member is noise).
function isActive(id) {
  return ui.hoverNodeId === id || (isSelected(id) && selectedIds.value.length === 1)
}

// ----- edges -----------------------------------------------------------------

const offsets = computed(() => routeOffsets(props.flowchart))

const edges = computed(() =>
  props.flowchart.edges
    .map((edge) => {
      const route = routeEdge(props.flowchart, edge, offsets.value[edge.id] || 0)
      return route ? { edge, route } : null
    })
    .filter(Boolean),
)

// ----- "+" handles (F2/F3) ---------------------------------------------------

// Outgoing handle positions for a node: a single bottom/right "+" for most
// types, one per branch for a decision (so each branch extends separately, F3).
function handlesFor(node) {
  if (node.nodeType === 'decision') {
    return node.branches.map((branch) => ({
      port: branch.port,
      label: branch.label,
      point: portPoint(node, branch.port, direction.value, branchInfoFor(node, branch.port)),
    }))
  }
  return [{ port: 'out', label: '', point: portPoint(node, 'out', direction.value, null) }]
}

// ----- inline text editing ---------------------------------------------------

function beginEdit(id) {
  flowchartUi.editingId = id
}

function commitEdit(id, value) {
  endFlowchartEdit(id)
  const node = props.flowchart.nodes.find((n) => n.id === id)
  const text = (value ?? '').trim()
  if (node && node.text !== text) store.updateFlowchartNode(id, { text })
}

// Enter commits (Shift+Enter inserts a newline); Escape cancels without saving.
function onEditKeydown(event, id) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    commitEdit(id, editFields.value[id]?.innerText)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    endFlowchartEdit(id)
  }
}

// ----- hover bookkeeping ------------------------------------------------------

function onEnter(id) {
  ui.hoverNodeId = id
}
function onLeave(id) {
  if (ui.hoverNodeId === id) ui.hoverNodeId = null
}
</script>

<template>
  <g>
    <!-- Arrowhead marker shared by all flow edges. -->
    <defs>
      <marker
        id="fc-arrow"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M0 0 L10 5 L0 10 z" fill="#7C7C7C" />
      </marker>
    </defs>

    <!-- Edges: orthogonal elbow paths with arrowheads + labels near the source. -->
    <g v-for="{ edge, route } in edges" :key="edge.id">
      <path
        :d="pointsToPath(route.points)"
        fill="none"
        stroke="#7C7C7C"
        stroke-width="2"
        :marker-end="edge.arrowheads?.end === false ? null : 'url(#fc-arrow)'"
      />
      <g v-if="edge.label" :transform="`translate(${route.labelPoint.x} ${route.labelPoint.y})`">
        <rect
          :x="-(edge.label.length * 4 + 8)"
          y="-10"
          :width="edge.label.length * 8 + 16"
          height="20"
          rx="6"
          fill="#FFFFFF"
          stroke="#E2E2E2"
        />
        <text
          x="0"
          y="0"
          text-anchor="middle"
          dominant-baseline="central"
          font-size="12"
          fill="#525252"
          style="font-family: Inter, sans-serif"
        >
          {{ edge.label }}
        </text>
      </g>
    </g>

    <!-- Drag-to-empty connector preview (F4). -->
    <line
      v-if="ui.pendingLink"
      :x1="ui.pendingLink.from.x"
      :y1="ui.pendingLink.from.y"
      :x2="ui.pendingLink.to.x"
      :y2="ui.pendingLink.to.y"
      stroke="#006EDB"
      stroke-width="2"
      stroke-dasharray="6 4"
    />

    <!-- Nodes -->
    <g
      v-for="{ node, size, shape, fill, stroke, ink } in nodes"
      :key="node.id"
      :data-fc-node="node.id"
      :transform="`translate(${node.x} ${node.y})`"
      :style="{ cursor: 'move', transition: editorUi.state.animateLayout ? 'transform 260ms ease' : 'none' }"
      @pointerenter="onEnter(node.id)"
      @pointerleave="onLeave(node.id)"
      @dblclick.stop="beginEdit(node.id)"
    >
      <rect
        v-if="shape.kind === 'rect'"
        :width="size.w"
        :height="size.h"
        :rx="shape.rx"
        :fill="fill"
        :stroke="isSelected(node.id) ? '#006EDB' : stroke"
        :stroke-width="isSelected(node.id) ? 2.5 : 1.5"
      />
      <ellipse
        v-else-if="shape.kind === 'ellipse'"
        :cx="size.w / 2"
        :cy="size.h / 2"
        :rx="size.w / 2"
        :ry="size.h / 2"
        :fill="fill"
        :stroke="isSelected(node.id) ? '#006EDB' : stroke"
        :stroke-width="isSelected(node.id) ? 2.5 : 1.5"
      />
      <path
        v-else-if="shape.kind === 'path'"
        :d="shape.d"
        :fill="fill"
        :stroke="isSelected(node.id) ? '#006EDB' : stroke"
        :stroke-width="isSelected(node.id) ? 2.5 : 1.5"
        stroke-linejoin="round"
      />
      <polygon
        v-else
        :points="shape.points"
        :fill="fill"
        :stroke="isSelected(node.id) ? '#006EDB' : stroke"
        :stroke-width="isSelected(node.id) ? 2.5 : 1.5"
      />

      <!-- Inline text editor (wraps; Enter commits, Shift+Enter adds a line). A
           flex wrapper centres the text vertically so it doesn't jump to the top
           when editing begins. -->
      <foreignObject v-if="editingId === node.id" x="6" y="6" :width="size.w - 12" :height="size.h - 12">
        <div class="fc-edit-wrap">
          <div
            :ref="(el) => (editFields[node.id] = el)"
            contenteditable="true"
            class="fc-edit"
            @keydown="onEditKeydown($event, node.id)"
            @blur="commitEdit(node.id, $event.target.innerText)"
            @pointerdown.stop
          >{{ node.text }}</div>
        </div>
      </foreignObject>
      <!-- Junction text wraps horizontally and overflows vertically past the small
           circle (P11): a tall, node-centred box that spills up/down as text grows. -->
      <foreignObject
        v-else-if="node.nodeType === 'connector' && node.text"
        x="2"
        :y="(size.h - JUNCTION_LABEL_H) / 2"
        :width="size.w - 4"
        :height="JUNCTION_LABEL_H"
        style="overflow: visible; pointer-events: none"
      >
        <div class="flex h-full w-full items-center justify-center text-center">
          <span :style="{ color: ink, fontFamily: 'Inter, sans-serif', fontSize: '13px', lineHeight: '1.2', wordBreak: 'break-word' }">{{ node.text }}</span>
        </div>
      </foreignObject>
      <!-- Static label: a wrapping, vertically-centred div (like block/mind-map)
           so long text wraps inside the node instead of overflowing it. -->
      <foreignObject
        v-else-if="node.nodeType !== 'connector'"
        :x="textInset(node)"
        y="4"
        :width="size.w - 2 * textInset(node)"
        :height="size.h - 8"
        style="pointer-events: none"
      >
        <div class="fc-label" :style="labelStyle(node, ink)">{{ node.text }}</div>
      </foreignObject>

      <!-- "+" extend handles on the active node (hover/selected), per spec B4/F3. -->
      <g v-if="isActive(node.id)">
        <g
          v-for="handle in handlesFor(node)"
          :key="handle.port"
          :data-fc-node="node.id"
          :data-fc-port="handle.port"
          :transform="`translate(${handle.point.x - node.x} ${handle.point.y - node.y})`"
          class="fc-handle"
          style="cursor: pointer"
        >
          <circle r="10" fill="#FFFFFF" stroke="#006EDB" stroke-width="1.5" />
          <path d="M-4 0 H4 M0 -4 V4" stroke="#006EDB" stroke-width="1.6" stroke-linecap="round" />
          <text
            v-if="handle.label"
            x="0"
            y="-16"
            text-anchor="middle"
            font-size="11"
            fill="#525252"
            style="font-family: Inter, sans-serif"
          >
            {{ handle.label }}
          </text>
        </g>
      </g>
    </g>

    <!-- Live rubber-band marquee while dragging empty canvas (logical units). -->
    <rect
      v-if="ui.marquee"
      :x="ui.marquee.x"
      :y="ui.marquee.y"
      :width="ui.marquee.w"
      :height="ui.marquee.h"
      fill="rgba(79,148,255,0.08)"
      stroke="#4F94FF"
      :stroke-width="1 / zoom"
      :stroke-dasharray="`${4 / zoom} ${3 / zoom}`"
    />

    <!-- Node-type picker overlay at the requested logical point (F2/F4). -->
    <foreignObject
      v-if="ui.picker"
      :x="ui.picker.x"
      :y="ui.picker.y"
      width="260"
      height="240"
      style="overflow: visible"
    >
      <FlowchartNodeTypePicker @choose="chooseNodeType" @close="closePicker" />
    </foreignObject>

    <!-- Alignment guides while dragging a node (shared with block diagrams). -->
    <SmartGuidesLayer />
  </g>
</template>

<style scoped>
/* Inline node editor: a flex wrapper centres the (wrapping) text vertically so
   it stays put when editing begins instead of jumping to the top. */
.fc-edit-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
}
.fc-edit {
  width: 100%;
  text-align: center;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  outline: none;
  font-family: Inter, sans-serif;
  font-size: 14px;
  line-height: 1.2;
  color: #1f2933;
}
/* Static label: wrap + vertically centre inside the node, matching the editor. */
.fc-label {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
  text-align: center;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: Inter, sans-serif;
  font-size: 14px;
  line-height: 1.2;
}
</style>
