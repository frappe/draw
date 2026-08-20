<script setup>
// Renders one connector (straight/curved/elbow) between two resolved endpoints,
// with single/double arrowheads and a midpoint label pill (spec §5.3, §6).
// Endpoints may be free {x,y} or attached {shapeId,anchor}; attached ends follow
// the shape on move/rotate because resolve() reads anchorPoint reactively.
// When selected, draggable endpoint handles allow re-attach/detach, and curved
// connectors expose a draggable midpoint control handle.
import { ref, computed, nextTick } from 'vue'
import { TextInput } from 'frappe-ui'
import { anchorPoint } from '@/diagram/geometry.js'
import { ROLE } from '@/diagram/freeFloating.js'
import { branchPathPoints } from '@/diagram/mindmapLayout.js'
import { flowchartPathData } from '@/diagram/flowchartPath.js'
import { connectorBodyMovable, translateConnectorBody } from '@/diagram/connectorMove.js'
import { safeHref } from '@/utils/safeUrl.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useConnectorDrawing } from '@/composables/useConnectorDrawing.js'
import { useFlowchartRoutes } from '@/composables/useFlowchartRoutes.js'
import ConnectorMarker from './ConnectorMarker.vue'

const props = defineProps({ connector: { type: Object, required: true } })

// Normalise an endpoint style: legacy booleans (true/false) → 'arrow'/'none'.
function normEnd(value) {
  if (value === true) return 'arrow'
  if (value === false || value == null) return 'none'
  return value
}

const store = useDiagramStore()
const editorUi = useEditorUi()
const drawing = useConnectorDrawing(store, editorUi)

// A flowchart edge is routed by the whole-chart pass in useFlowchartRoutes, which
// is the only place that can see the other nodes it must avoid, the sibling edges
// it must spread away from, and the routes it crosses (#441 items 7, 8, 9, 16, 19).
// Its endpoints come from that route rather than from a stored anchor: an anchor
// written at creation time goes stale the moment the user drags a node, which is
// what used to leave arrows doubling back into the wrong side of a shape (#410).
const flowchartRoutes = useFlowchartRoutes(store)
const flowchartRoute = computed(() =>
  props.connector.role === ROLE.flowchartEdge ? flowchartRoutes.value[props.connector.id] : null,
)

// Resolve an endpoint to a concrete world point (attached anchor or free point).
function resolve(endpoint, anchorOverride) {
  if (endpoint && endpoint.shapeId) {
    const shape = store?.shapeById(endpoint.shapeId)
    if (shape) return anchorPoint(shape, anchorOverride || endpoint.anchor || 'right')
  }
  return { x: endpoint?.x || 0, y: endpoint?.y || 0 }
}

// A routed flowchart edge already knows exactly where it begins and ends; anything
// else resolves its own endpoints. Falling back to `resolve` covers a flowchart
// edge whose nodes have gone (mid-delete) so it never renders at 0,0.
const routePoints = computed(() => flowchartRoute.value?.points || null)
const start = computed(() => routePoints.value?.[0] || resolve(props.connector.from))
const end = computed(
  () => routePoints.value?.[routePoints.value.length - 1] || resolve(props.connector.to),
)

// Curved connectors carry an optional control point; default to the apex above.
const control = computed(() => {
  const stored = props.connector.midpoint
  if (stored) return stored
  return { x: (start.value.x + end.value.x) / 2, y: start.value.y }
})

const elbowMidX = computed(() => (start.value.x + end.value.x) / 2)

const selected = computed(() => store.state.selection.includes(props.connector.id))
const style = computed(() => props.connector.style || {})

// A mind-map branch is a STRUCTURAL edge (#272): it isn't independently
// selectable/deletable (no hit path → no context menu, no delete — a child always
// keeps its one connector), and its colour is DERIVED from the child node's border
// rather than a stored style, falling back to the default gray for a border-less
// node. So it always tracks the node it belongs to.
const DEFAULT_BRANCH_COLOR = '#525252'
const isBranch = computed(() => props.connector.role === ROLE.mindmapBranch)
const strokeColor = computed(() => {
  if (!isBranch.value) return style.value.color
  const child = store.shapeById(props.connector.mindmap?.childId || props.connector.to?.shapeId)
  return child?.border?.color || DEFAULT_BRANCH_COLOR
})

// Dash pattern scales with width so dashes/dots stay proportional at any weight.
const dashArray = computed(() => {
  const w = style.value.width || 2.2
  if (style.value.dash === 'dashed') return `${w * 3} ${w * 2}`
  if (style.value.dash === 'dotted') return `${w} ${w * 2}`
  return null
})

const pathData = computed(() => {
  const a = start.value
  const b = end.value
  // A routed flowchart edge draws the polyline the router produced, hopping any
  // route it crosses (#441 item 9). Its corners are rounded by the same rule the
  // generic elbow uses, so the two still look like one family of connector.
  const route = flowchartRoute.value
  if (route) return flowchartPathData(route.points, route.crossings, style.value.corner)
  // A mind-map branch is a structural edge: draw the symmetric cubic that leaves the
  // parent and eases into the child horizontally (both tangents flat), so up/down
  // branches mirror — not the generic quadratic whose lone control sits at the
  // parent's y and makes a downward branch plunge into the child (#266).
  if (props.connector.role === ROLE.mindmapBranch) return branchPathPoints(a, b)
  if (props.connector.type === 'curved') return `M ${a.x} ${a.y} Q ${control.value.x} ${control.value.y} ${b.x} ${b.y}`
  if (props.connector.type === 'elbow') return elbowPath(a, b, elbowMidX.value, style.value.corner)
  return `M ${a.x} ${a.y} L ${b.x} ${b.y}`
})

// Two-bend elbow A→(midX,A.y)→(midX,B.y)→B. 'rounded' replaces each right-angle
// bend with a quadratic arc whose radius is clamped to the shortest leg so it
// never overshoots on a tight route; 'sharp' keeps the literal corners.
function elbowPath(a, b, midX, corner) {
  const sharp = `M ${a.x} ${a.y} L ${midX} ${a.y} L ${midX} ${b.y} L ${b.x} ${b.y}`
  if (corner === 'sharp') return sharp
  const r = Math.min(14, Math.abs(midX - a.x) / 2, Math.abs(b.y - a.y) / 2, Math.abs(b.x - midX) / 2)
  if (!(r > 0.5)) return sharp
  const sx1 = Math.sign(midX - a.x)
  const sy = Math.sign(b.y - a.y)
  const sx2 = Math.sign(b.x - midX)
  return (
    `M ${a.x} ${a.y} L ${midX - sx1 * r} ${a.y} ` +
    `Q ${midX} ${a.y} ${midX} ${a.y + sy * r} ` +
    `L ${midX} ${b.y - sy * r} ` +
    `Q ${midX} ${b.y} ${midX + sx2 * r} ${b.y} L ${b.x} ${b.y}`
  )
}

// Label pill sits at the geometric midpoint of the route. For a routed flowchart
// edge that is the midpoint ALONG the polyline, not the midpoint of a straight line
// between its ends — on a route that bends around a node those are different points,
// and only the first is guaranteed to land on the line.
const labelAnchor = computed(() => {
  const route = flowchartRoute.value
  if (route) return midpointAlong(route.points)
  if (props.connector.type === 'curved') {
    const q = control.value
    return { x: (start.value.x + 2 * q.x + end.value.x) / 4, y: (start.value.y + 2 * q.y + end.value.y) / 4 }
  }
  return { x: (start.value.x + end.value.x) / 2, y: (start.value.y + end.value.y) / 2 }
})

// Hyperlink badge (#542, mirrors ShapeView's spec 6.5 badge). Only render the
// anchor for a safe scheme — safeHref is the same gate ShapeView uses, so a
// crafted `javascript:` link in a shared document stays inert here too. Offset
// above the label anchor rather than sitting ON an endpoint, so it never
// collides with the arrowhead marker there or with the label pill (which is
// centred ON the label anchor) whether or not the connector carries a label.
const safeLink = computed(() => safeHref(props.connector.link))
const linkBadgeAnchor = computed(() => ({ x: labelAnchor.value.x, y: labelAnchor.value.y - 20 }))

// The point half the polyline's length along it.
function midpointAlong(points) {
  let total = 0
  for (let i = 0; i < points.length - 1; i += 1) total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y)
  let remaining = total / 2
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    const segment = Math.hypot(b.x - a.x, b.y - a.y)
    if (segment >= remaining) {
      const t = segment === 0 ? 0 : remaining / segment
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
    remaining -= segment
  }
  return points[points.length - 1]
}

const startMarkerId = computed(() => `mk-start-${props.connector.id}`)
const endMarkerId = computed(() => `mk-end-${props.connector.id}`)
const startType = computed(() => normEnd(props.connector.arrowheads?.start))
const endType = computed(() => normEnd(props.connector.arrowheads?.end))
const labelWidth = computed(() => (props.connector.label?.length || 0) * 7 + 16)

// Endpoint / control-point dragging. Reuses the snap logic from the composable.
const dragging = ref(null)

function toLogical(event, node) {
  // CTM off `node` itself, not its `ownerSVGElement` — the root canvas <svg> has
  // no transform of its own, so its CTM skips the ancestor <g>'s pan/zoom entirely.
  // `node` (the dragged handle/hit-path) sits inside that <g>, so its own CTM
  // correctly includes it — the same house pattern HoverArrows/HoverOutline/
  // MindmapHoverHandles/FlowchartHoverHandles use via their own `layer.value`.
  const ctm = node.getScreenCTM()
  const point = node.ownerSVGElement.createSVGPoint()
  point.x = event.clientX
  point.y = event.clientY
  const local = point.matrixTransform(ctm.inverse())
  return { x: local.x, y: local.y }
}

function startDrag(which, event) {
  dragging.value = which
  event.target.setPointerCapture?.(event.pointerId)
}

function onDrag(event) {
  if (!dragging.value) return
  const point = toLogical(event, event.target)
  if (dragging.value === 'control') {
    store.updateConnector(props.connector.id, { midpoint: { x: Math.round(point.x), y: Math.round(point.y) } })
    return
  }
  drawing.moveEndpoint(props.connector.id, dragging.value, point)
}

function endDrag() {
  dragging.value = null
}

function onConnectorClick(event) {
  event.stopPropagation()
  if (event.shiftKey) store.addToSelection(props.connector.id)
  else store.select(props.connector.id)
}

// Drag the connector's own body (#542) — the same select-then-move gesture a
// shape gets, scoped to just this connector rather than routed through the
// shared canvas selection/marquee flow. A shift/modifier press is left to
// onConnectorClick's add-to-selection instead of starting a move. Naturally a
// no-op for anything fully pinned between two shapes (structural connectors
// included, since both their ends are always attached — connectorBodyMovable).
const bodyDragStart = ref(null)
function startBodyDrag(event) {
  if (event.shiftKey || event.metaKey || event.ctrlKey) return
  store.select(props.connector.id)
  if (!connectorBodyMovable(props.connector)) return
  bodyDragStart.value = toLogical(event, event.target)
  event.target.setPointerCapture?.(event.pointerId)
}
function onBodyDrag(event) {
  if (!bodyDragStart.value) return
  const point = toLogical(event, event.target)
  const dx = point.x - bodyDragStart.value.x
  const dy = point.y - bodyDragStart.value.y
  bodyDragStart.value = point
  const patch = translateConnectorBody(props.connector, dx, dy)
  if (Object.keys(patch).length) store.updateConnector(props.connector.id, patch)
}
function endBodyDrag() {
  bodyDragStart.value = null
}

// Double-click a connector to type its centred label inline.
const editingLabel = ref(false)
const labelField = ref(null)
function onConnectorDblClick(event) {
  event.stopPropagation()
  store.select(props.connector.id)
  editingLabel.value = true
  nextTick(() => {
    // frappe-ui's TextInput exposes its native element as `el`.
    const el = labelField.value?.el || labelField.value
    if (el) {
      el.focus()
      el.select?.()
    }
  })
}
function commitLabel(value) {
  editingLabel.value = false
  if (value !== props.connector.label) store.updateConnector(props.connector.id, { label: value })
}
const editorWidth = computed(() => Math.max(72, labelWidth.value))
// frappe-ui's `sm` control height, so the foreignObject matches the control rather
// than the control being squeezed into an arbitrary box.
const LABEL_EDITOR_H = 28
</script>

<template>
  <g :data-connector-id="connector.id">
    <defs>
      <ConnectorMarker :id="startMarkerId" :type="startType" :color="style.color" orient="auto-start-reverse" />
      <ConnectorMarker :id="endMarkerId" :type="endType" :color="style.color" orient="auto" />
    </defs>

    <!-- Wide invisible hit path makes the thin connector easy to click; double-
         click types a label; a plain press-drag moves the connector's own body
         (#542) when it has a free end to move (connectorBodyMovable). Omitted
         for a structural mind-map branch, which must not be
         selectable/labelable/deletable/draggable on its own (#272). -->
    <path v-if="!isBranch"
      :d="pathData"
      fill="none"
      stroke="transparent"
      stroke-width="14"
      class="cursor-pointer"
      @click="onConnectorClick"
      @dblclick="onConnectorDblClick"
      @pointerdown.stop.prevent="startBodyDrag"
      @pointermove="onBodyDrag"
      @pointerup="endBodyDrag"
    />

    <path
      :d="pathData"
      fill="none"
      :stroke="strokeColor"
      :stroke-width="style.width"
      :stroke-dasharray="dashArray"
      stroke-linecap="round"
      stroke-linejoin="round"
      :marker-start="startType !== 'none' ? `url(#${startMarkerId})` : null"
      :marker-end="endType !== 'none' ? `url(#${endMarkerId})` : null"
    />

    <!-- Double-clicking the label pill renames it, so a branch can carry a specific
         sentence rather than just Yes/No (#441 round 2). The pill has to take
         pointer events for that: it is far taller than the route's 14px hit path,
         so a double-click aimed at the words used to fall in the gap beside the
         line and do nothing. It can afford to be interactive now that the "+"
         handles paint AFTER the connectors — SVG hit-testing follows paint order,
         so a handle sitting over a label still wins the click. -->
    <g
      v-if="connector.label && !editingLabel"
      class="cursor-pointer"
      @click.stop="onConnectorClick"
      @dblclick.stop="onConnectorDblClick"
      @pointerdown.stop
    >
      <rect
        :x="labelAnchor.x - labelWidth / 2"
        :y="labelAnchor.y - 11"
        :width="labelWidth"
        height="22"
        rx="6"
        fill="#FFFFFF"
        stroke="#E2E2E2"
        stroke-width="1"
      />
      <text
        :x="labelAnchor.x"
        :y="labelAnchor.y"
        text-anchor="middle"
        dominant-baseline="central"
        font-size="12"
        font-family="Inter, sans-serif"
        fill="#525252"
      >
        {{ connector.label }}
      </text>
    </g>

    <!-- Hyperlink badge (#542, spec 6.5): opens the connector's link in a new
         tab, mirroring ShapeView's badge. Click is isolated so it never
         moves/selects/starts a body drag. -->
    <a
      v-if="safeLink"
      :href="safeLink"
      target="_blank"
      rel="noopener noreferrer"
      style="cursor: pointer"
      @pointerdown.stop
      @click.stop
    >
      <title>{{ safeLink }}</title>
      <circle :cx="linkBadgeAnchor.x" :cy="linkBadgeAnchor.y" r="9" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1" />
      <!-- The lucide "link" glyph, inlined — same reasoning as ShapeView's copy:
           this sits inside the canvas SVG, where an icon-font <span> has no
           layout box at all (#311). -->
      <svg
        :x="linkBadgeAnchor.x - 5"
        :y="linkBadgeAnchor.y - 5"
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="text-ink-gray-7"
      >
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    </a>

    <!-- Inline label editor (centred on the connector, opaque over the line). It is
         chrome drawn over the canvas, so it is a frappe-ui control rather than a
         hand-styled input; the foreignObject is sized to the control's own height
         instead of the height being hardcoded onto it. -->
    <foreignObject
      v-if="editingLabel"
      :x="labelAnchor.x - editorWidth / 2"
      :y="labelAnchor.y - LABEL_EDITOR_H / 2"
      :width="editorWidth"
      :height="LABEL_EDITOR_H"
    >
      <!-- The `[&_input]` variant is what reaches the real element; a bare
           `text-center` does not (#496). TextInput sets inheritAttrs: false and
           routes the consumer's class to its WRAPPER, then builds the input's own
           attrs by filtering class and style out — so the centring landed on a div,
           and the native input sets its own text-align regardless. The committed label is
           drawn text-anchor="middle", so the text sat left while being typed and
           jumped to centre the moment it committed. -->
      <TextInput
        ref="labelField"
        size="sm"
        variant="outline"
        placeholder="Label"
        class="w-full [&_input]:text-center"
        :model-value="connector.label"
        @keydown.enter.prevent="commitLabel($event.target.value)"
        @keydown.escape.prevent="editingLabel = false"
        @blur="commitLabel($event.target.value)"
        @click.stop
        @pointerdown.stop
      />
    </foreignObject>

    <!-- Selection: draggable endpoints (re-attach/detach) + curved midpoint handle.
         A routed flowchart edge shows none of them: its endpoints are derived from
         the two nodes on every render, so dragging one would be a control that
         visibly does nothing. Such an edge is re-pointed by moving its node. -->
    <g v-if="selected && !flowchartRoute">
      <circle
        :cx="control.x"
        :cy="control.y"
        r="6"
        fill="#FFFFFF"
        stroke="#006EDB"
        stroke-width="1.5"
        class="cursor-move"
        v-if="connector.type === 'curved'"
        @pointerdown.stop.prevent="startDrag('control', $event)"
        @pointermove="onDrag"
        @pointerup="endDrag"
      />
      <circle
        :cx="start.x"
        :cy="start.y"
        r="6"
        fill="#FFFFFF"
        stroke="#006EDB"
        stroke-width="1.5"
        class="cursor-move"
        @pointerdown.stop.prevent="startDrag('from', $event)"
        @pointermove="onDrag"
        @pointerup="endDrag"
      />
      <circle
        :cx="end.x"
        :cy="end.y"
        r="6"
        fill="#FFFFFF"
        stroke="#006EDB"
        stroke-width="1.5"
        class="cursor-move"
        @pointerdown.stop.prevent="startDrag('to', $event)"
        @pointermove="onDrag"
        @pointerup="endDrag"
      />
    </g>
  </g>
</template>
