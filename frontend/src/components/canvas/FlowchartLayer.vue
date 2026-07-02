<script setup>
// Flowchart render layer (spec diagram-types Part B, F1-F5). Draws the typed
// node shapes (terminator/process/decision/inputOutput/connector), orthogonal
// arrowed edges with midpoint labels, the "+" extend handles on the selected /
// hovered node (decision shows one per labelled branch), inline text editing, the
// drag-to-empty connector preview, and the node-type picker overlay.
//
// Rendered inside the canvas viewport <g>, so all geometry is in canvas units
// (Part G4). This component instantiates the flowchart interaction composable so
// its pointer handlers are registered into the shared modeInteraction seam — the
// canvas only mounts this layer for flowchart diagrams (Part G1).
import { computed, inject, ref } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useFlowchartInteraction } from '@/composables/useFlowchartInteraction.js'
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

const props = defineProps({
  flowchart: { type: Object, required: true },
})

const store = useDiagramStore()
const editorUi = useEditorUi()
const interactionRef = inject('modeInteraction', null)
const { ui, chooseNodeType, closePicker } = useFlowchartInteraction(
  store,
  editorUi,
  interactionRef,
)

const direction = computed(() => props.flowchart.direction || 'TB')
const triad = computed(() => primaryTriad(store.state.themePreset))

// Selection holds node ids in flowchart mode (may be many with multi-select).
const selectedIds = computed(() => store.state.selection)
const editingId = ref(null) // node whose text is being edited inline
const zoom = computed(() => editorUi.viewport.state.zoom || 1)

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
  editingId.value = id
}

function commitEdit(id, value) {
  editingId.value = null
  const node = props.flowchart.nodes.find((n) => n.id === id)
  if (node && node.text !== value) store.updateFlowchartNode(id, { text: value })
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

    <!-- Edges: orthogonal elbow paths with arrowheads + midpoint labels. -->
    <g v-for="{ edge, route } in edges" :key="edge.id">
      <path
        :d="pointsToPath(route.points)"
        fill="none"
        stroke="#7C7C7C"
        stroke-width="2"
        :marker-end="edge.arrowheads.end ? 'url(#fc-arrow)' : null"
      />
      <g v-if="edge.label" :transform="`translate(${route.midpoint.x} ${route.midpoint.y})`">
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
      <polygon
        v-else
        :points="shape.points"
        :fill="fill"
        :stroke="isSelected(node.id) ? '#006EDB' : stroke"
        :stroke-width="isSelected(node.id) ? 2.5 : 1.5"
      />

      <!-- Inline text editor (foreignObject) or static label. -->
      <foreignObject v-if="editingId === node.id" x="6" y="6" :width="size.w - 12" :height="size.h - 12">
        <input
          :value="node.text"
          class="h-full w-full bg-transparent text-center text-[14px] outline-none"
          style="font-family: Inter, sans-serif; color: #1f2933"
          autofocus
          @keydown.enter.prevent="commitEdit(node.id, $event.target.value)"
          @blur="commitEdit(node.id, $event.target.value)"
          @pointerdown.stop
        />
      </foreignObject>
      <text
        v-else-if="node.nodeType !== 'connector'"
        :x="size.w / 2"
        :y="size.h / 2"
        text-anchor="middle"
        dominant-baseline="central"
        font-size="14"
        :fill="ink"
        style="font-family: Inter, sans-serif; pointer-events: none"
      >
        {{ node.text }}
      </text>

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
      width="176"
      height="220"
      style="overflow: visible"
    >
      <FlowchartNodeTypePicker @choose="chooseNodeType" @close="closePicker" />
    </foreignObject>
  </g>
</template>
