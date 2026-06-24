<script setup>
// The diagram canvas. One <svg> with a <g> carrying the viewport transform
// translate(panX panY) scale(zoom). Layer order (bottom→top): paper, GridLayer,
// connectors, shapes (zIndex order), SmartGuidesLayer, HoverArrows,
// SelectionLayer, TextEditor. Opens fit-to-view + centered (spec §4.1).
//
// Dynamic pan area (spec §4.1): the pannable region is the canvas rect plus a
// small margin, stretched to enclose any shape that leaves the canvas and
// auto-shrunk when it returns. Native scrollbars appear when that region (in
// screen pixels) exceeds the viewport. Browser ctrl-zoom is intercepted.
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick, provide, inject } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useModeStrategy } from '@/stores/useModeStrategy.js'
import { themeVarStyle } from '@/diagram/theme.js'
import { axisAlignedBBox, anchorPoint, pointInShape } from '@/diagram/geometry.js'
import { layoutMindMap } from '@/diagram/mindmapLayout.js'
import { flowchartContentBounds } from '@/diagram/flowchartLayout.js'
import { whiteboardContentBounds } from '@/diagram/whiteboardLayout.js'
import { useSelection } from '@/composables/useSelection.js'
import { useShapeCreation } from '@/composables/useShapeCreation.js'
import { useTextEditing } from '@/composables/useTextEditing.js'
import { useFormatPainter } from '@/composables/useFormatPainter.js'
import GridLayer from './GridLayer.vue'
import ShapeView from './ShapeView.vue'
import ConnectorView from './ConnectorView.vue'
import SmartGuidesLayer from './SmartGuidesLayer.vue'
import HoverArrows from './HoverArrows.vue'
import SelectionLayer from './SelectionLayer.vue'
import TextEditor from './TextEditor.vue'
import MindMapNodeLayer from './MindMapNodeLayer.vue'
import FlowchartLayer from './FlowchartLayer.vue'
import WhiteboardLayer from './WhiteboardLayer.vue'
import Rulers from './Rulers.vue'
import { useModeInteraction } from '@/composables/useModeInteraction.js'

const store = useDiagramStore()
const editorUi = useEditorUi()
const modeStrategy = useModeStrategy()
const viewport = editorUi.viewport

// Surface-interaction delegation seam (Part G1/G4): when the active strategy sets
// handlesSurfaceInteraction (flowchart/whiteboard), the type's interaction object
// registered here owns pointer/dblclick/wheel; otherwise we fall back to the
// shared block/mindmap handling below.
const modeInteraction = useModeInteraction()

// A type that renders its own layer replaces the block shape/connector loops.
// Each such type frames its own content bbox for fit + the scroll region (G8).
const rendersOwnLayer = computed(() => modeStrategy.value.rendersOwnLayer)
const activeType = computed(() => modeStrategy.value.type)

// Kept as `isMindmap` for the existing block/mindmap branches below; true only
// for the mind-map auto-layout type (block stays false; flowchart/whiteboard get
// their own branches via activeType).
const isMindmap = computed(() => activeType.value === 'mindmap')
const isFlowchart = computed(() => activeType.value === 'flowchart')
const isWhiteboard = computed(() => activeType.value === 'whiteboard')

const mindmapLayout = computed(() =>
  isMindmap.value && store.state.mindmap ? layoutMindMap(store.state.mindmap) : null,
)

// Derived content bbox per own-layer type, reused for fit-to-view + scroll region
// (Part G8). Null for block (which uses the bounded paper rect).
const ownLayerBounds = computed(() => {
  if (isMindmap.value && mindmapLayout.value) return mindmapLayout.value.bbox
  if (isFlowchart.value && store.state.flowchart) return flowchartContentBounds(store.state.flowchart)
  if (isWhiteboard.value && store.state.whiteboard) {
    return whiteboardContentBounds(store.state.whiteboard, store.state.shapes)
  }
  return null
})

// Canvas interaction layers. Each composable attaches its own window listeners
// during a gesture; here we only route the surface's pointer/drag/dblclick.
const selection = useSelection(store, editorUi)
const creation = useShapeCreation(store, editorUi)
const editing = useTextEditing(store, editorUi)
const painter = useFormatPainter(store, editorUi)

// SelectionLayer renders the marquee rect via this provided handle (spec §7.2).
provide('selectionMarquee', selection.marquee)

const surface = ref(null)
const viewWidth = ref(0)
const viewHeight = ref(0)
let syncingScroll = false // guards the pan<->scroll feedback loop
const PAN_MARGIN = 80 // logical units of breathing room around the content

const canvas = computed(() => store.state.canvas)
const themeStyle = computed(() => themeVarStyle(store.state.themePreset))
const paperBackground = computed(() => canvas.value.background || '#FFFFFF')

// Shapes render in ascending zIndex order so later items sit on top.
const orderedShapes = computed(() =>
  [...store.state.shapes].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0)),
)

const groupTransform = computed(
  () => `translate(${viewport.state.panX} ${viewport.state.panY}) scale(${viewport.state.zoom})`,
)

// Logical extent that should be reachable: canvas rect unioned with every
// shape's axis-aligned box, padded by a small margin. Shrinks back to the
// canvas + margin when shapes return inside (spec §4.1 net rule).
const contentExtent = computed(() => {
  // Own-layer types (mindmap/flowchart/whiteboard) have no bounded paper: their
  // derived content bbox is the whole reachable content. Mind-map bbox starts at
  // 0,0; flowchart/whiteboard bboxes carry their own x/y. PAN_MARGIN pads each.
  const bounds = ownLayerBounds.value
  if (rendersOwnLayer.value && bounds) {
    return {
      x: (bounds.x ?? 0) - PAN_MARGIN,
      y: (bounds.y ?? 0) - PAN_MARGIN,
      w: bounds.w + PAN_MARGIN * 2,
      h: bounds.h + PAN_MARGIN * 2,
    }
  }
  let minX = 0
  let minY = 0
  let maxX = canvas.value.width
  let maxY = canvas.value.height
  for (const shape of store.state.shapes) {
    const box = axisAlignedBBox(shape)
    minX = Math.min(minX, box.x)
    minY = Math.min(minY, box.y)
    maxX = Math.max(maxX, box.x + box.w)
    maxY = Math.max(maxY, box.y + box.h)
  }
  return {
    x: minX - PAN_MARGIN,
    y: minY - PAN_MARGIN,
    w: maxX - minX + PAN_MARGIN * 2,
    h: maxY - minY + PAN_MARGIN * 2,
  }
})

// The scrollable region in screen pixels: the union of the viewport and the
// content's current screen rect. We anchor it at the viewport's top-left and
// extend it on whichever side(s) the content overflows. `offset` records how
// far the content's top-left sits *before* the viewport origin (i.e. how much
// the user must be able to scroll up/left to reach it); spec §4.1.
const scrollRegion = computed(() => {
  const extent = contentExtent.value
  const zoom = viewport.state.zoom
  const contentLeft = viewport.state.panX + extent.x * zoom
  const contentTop = viewport.state.panY + extent.y * zoom
  const contentRight = contentLeft + extent.w * zoom
  const contentBottom = contentTop + extent.h * zoom
  const offsetX = Math.max(0, -contentLeft)
  const offsetY = Math.max(0, -contentTop)
  return {
    offsetX,
    offsetY,
    width: offsetX + Math.max(viewWidth.value, contentRight),
    height: offsetY + Math.max(viewHeight.value, contentBottom),
  }
})

// Spacer sized to the scrollable region so native scrollbars appear whenever
// the pannable region exceeds the viewport (from stretch or zoom).
const stageStyle = computed(() => ({
  width: `${scrollRegion.value.width}px`,
  height: `${scrollRegion.value.height}px`,
}))

// Feed container + canvas size to the viewport, then fit-to-view centered.
// The box fit-to-view should frame: the mind-map tree's bbox, else the paper.
function fitContentSize() {
  const bounds = ownLayerBounds.value
  if (rendersOwnLayer.value && bounds) return { w: bounds.w, h: bounds.h }
  return { w: canvas.value.width, h: canvas.value.height }
}

function fitToView() {
  if (!surface.value) return
  const bounds = surface.value.getBoundingClientRect()
  viewWidth.value = bounds.width
  viewHeight.value = bounds.height
  const size = fitContentSize()
  viewport.setMeasure({
    containerW: bounds.width,
    containerH: bounds.height,
    canvasW: size.w,
    canvasH: size.h,
  })
  viewport.fit()
}

let resizeObserver = null

onMounted(() => {
  fitToView()
  resizeObserver = new ResizeObserver(() => syncMeasure())
  resizeObserver.observe(surface.value)
  window.addEventListener('keydown', onZoomKey)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', onZoomKey)
})

// Keep the viewport's container measure current (without re-fitting), and keep
// the cached viewport pixel size used by the scroll-region math up to date.
function syncMeasure() {
  if (!surface.value) return
  const bounds = surface.value.getBoundingClientRect()
  viewWidth.value = bounds.width
  viewHeight.value = bounds.height
  viewport.setMeasure({ containerW: bounds.width, containerH: bounds.height })
  nextTick(syncScrollFromPan)
}

// Scroll position that makes the native scrollbars agree with the current pan.
function scrollForPan() {
  const region = scrollRegion.value
  const extent = contentExtent.value
  const zoom = viewport.state.zoom
  return {
    left: region.offsetX - extent.x * zoom - viewport.state.panX,
    top: region.offsetY - extent.y * zoom - viewport.state.panY,
  }
}

// Push the current pan into the scrollbars (after wheel/drag/fit/zoom).
function syncScrollFromPan() {
  if (!surface.value || syncingScroll) return
  const target = scrollForPan()
  if (
    Math.abs(surface.value.scrollLeft - target.left) < 0.5 &&
    Math.abs(surface.value.scrollTop - target.top) < 0.5
  ) {
    return
  }
  syncingScroll = true
  surface.value.scrollLeft = target.left
  surface.value.scrollTop = target.top
  requestAnimationFrame(() => (syncingScroll = false))
}

// Native scrollbar dragged / wheel-scrolled the container → mirror into pan.
function onScroll() {
  if (syncingScroll || !surface.value) return
  const region = scrollRegion.value
  const extent = contentExtent.value
  const zoom = viewport.state.zoom
  syncingScroll = true
  viewport.setPan(
    region.offsetX - extent.x * zoom - surface.value.scrollLeft,
    region.offsetY - extent.y * zoom - surface.value.scrollTop,
  )
  requestAnimationFrame(() => (syncingScroll = false))
}

// Whenever pan/zoom changes (wheel, hand-drag, fit, zoom buttons), reconcile
// the scrollbar positions so they reflect where the canvas now sits.
watch(
  () => [viewport.state.panX, viewport.state.panY, viewport.state.zoom],
  () => nextTick(syncScrollFromPan),
)

// Re-fit when the canvas preset changes so the new paper opens centered.
watch(
  () => [canvas.value.width, canvas.value.height],
  () => nextTick(fitToView),
)

// As an own-layer type's content grows (tree nodes, flowchart nodes, strokes),
// keep the viewport's fit measure current so the Fit control frames the whole
// content (we don't auto-refit on every change, to avoid a jarring zoom jump
// while the user is building).
watch(
  () => ownLayerBounds.value && [ownLayerBounds.value.w, ownLayerBounds.value.h],
  () => {
    if (!rendersOwnLayer.value) return
    const size = fitContentSize()
    viewport.setMeasure({ canvasW: size.w, canvasH: size.h })
  },
)

function pointerPosition(event) {
  const bounds = surface.value.getBoundingClientRect()
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
}

// Whether the active strategy delegates surface events to a registered mode
// interaction object (flowchart/whiteboard). Hand-tool panning is never
// delegated — it stays shared so every type pans the same way.
function delegatesSurface() {
  return modeStrategy.value.handlesSurfaceInteraction && modeInteraction.value
}

// Context handed to mode interaction handlers; `point` is already in canvas units
// (Part G4) via the shared viewport transform.
function interactionContext(event) {
  const point = selection.toLogicalFor(event, surface.value.getBoundingClientRect(), viewport)
  return { point, event, viewport, store, editorUi }
}

// Try delegating one surface event to the mode interaction's handler. Returns
// true when the type owns the event so the shared fallback is skipped.
function delegateSurfaceEvent(handlerName, event) {
  if (!delegatesSurface()) return false
  const handler = modeInteraction.value[handlerName]
  if (typeof handler !== 'function') return false
  handler(event, interactionContext(event))
  return true
}

function onWheel(event) {
  if (delegateSurfaceEvent('onWheel', event)) return
  const { x, y } = pointerPosition(event)
  viewport.handleWheel(event, x, y)
}

// Intercept the browser's ctrl/cmd +/- (and 0) zoom; route +/- to the viewport.
function onZoomKey(event) {
  if (!(event.ctrlKey || event.metaKey)) return
  if (event.key === '+' || event.key === '=') {
    event.preventDefault()
    viewport.zoomStep(1)
  } else if (event.key === '-') {
    event.preventDefault()
    viewport.zoomStep(-1)
  } else if (event.key === '0') {
    event.preventDefault()
    editorUi.reset100()
  }
}

const panning = computed(() => editorUi.state.tool === 'hand')

// Route a surface pointerdown to the active tool: hand pans, draw creates, and
// select either applies the format painter to a clicked shape or runs the
// normal click/move/marquee selection (spec §7.1/§7.2/§4.3).
function onSurfacePointerDown(event) {
  // Hand tool always pans, for every type (shared transform, Part G4).
  if (editorUi.state.tool === 'hand') return viewport.startPan(event)
  // Flowchart/whiteboard own the surface (+ handles, drag-to-empty, pen, sticky):
  // delegate to the registered mode interaction (Part G1).
  if (delegateSurfaceEvent('onPointerDown', event)) return
  // Mind map is auto-layout: no free shape select/draw/move on the surface
  // (node interactions live on the nodes themselves).
  if (isMindmap.value) return
  if (editorUi.state.tool === 'draw') return creation.onCanvasPointerDown(event)
  if (painter.isActive()) return applyPainterAt(event)
  selection.onSurfacePointerdown(event)
}

// While the format painter is armed, a left-click stamps the copied style onto
// the clicked shape instead of selecting it; an empty click cancels the painter.
function applyPainterAt(event) {
  if (event.button !== 0) return
  const point = selection.toLogicalFor(event, surface.value.getBoundingClientRect(), viewport)
  const shape = topShapeAt(point)
  if (shape) painter.applyTo(shape.id)
  else painter.cancel()
}

function onSurfacePointerMove(event) {
  if (panning.value) return viewport.movePan(event)
  if (delegateSurfaceEvent('onPointerMove', event)) return
  if (!isMindmap.value && editorUi.state.tool === 'draw') creation.onCanvasPointerMove(event)
}

function onSurfacePointerUp(event) {
  viewport.endPan()
  if (delegateSurfaceEvent('onPointerUp', event)) return
  if (!isMindmap.value && editorUi.state.tool === 'draw') creation.onCanvasPointerUp(event)
}

// Double-click: edit the text of a hit shape, the label of a hit connector, or
// spawn the last-used shape in edit mode on empty canvas (spec §6/§7.1).
function onSurfaceDoubleClick(event) {
  // Whiteboard double-click-to-type / flowchart double-click handling is owned by
  // the type's mode interaction (Part G5: double-click empty = textbox vs shape).
  if (delegateSurfaceEvent('onDoubleClick', event)) return
  if (isMindmap.value) return // node text editing arrives in M2
  const point = selection.toLogicalFor(event, surface.value.getBoundingClientRect(), viewport)
  const shape = topShapeAt(point)
  if (shape) return editing.beginTextEdit(shape.id)
  const connector = connectorAt(point)
  if (connector) return editing.beginConnectorLabelEdit(connector.id)
  editing.beginEmptyCanvasCreate(point)
}

function topShapeAt(point) {
  const hits = store.state.shapes.filter((shape) => pointInShape(point, shape))
  if (!hits.length) return null
  return hits.reduce((top, shape) => ((shape.zIndex || 0) >= (top.zIndex || 0) ? shape : top))
}

// Nearest connector whose segment passes within a small logical tolerance of the
// point, resolving attached endpoints to their anchor.
function connectorAt(point) {
  const TOLERANCE = 8
  for (const connector of store.state.connectors) {
    const a = endpointPoint(connector.from)
    const b = endpointPoint(connector.to)
    if (distanceToSegment(point, a, b) <= TOLERANCE) return connector
  }
  return null
}

function endpointPoint(endpoint) {
  if (endpoint?.shapeId) {
    const shape = store.shapeById(endpoint.shapeId)
    if (shape) return anchorPoint(shape, endpoint.anchor || 'right')
  }
  return { x: endpoint?.x || 0, y: endpoint?.y || 0 }
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  if (!lengthSquared) return Math.hypot(point.x - a.x, point.y - a.y)
  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}

// Cursor per pointer mode (spec §7.1): hand = grab, draw = dotted-line plus
// (an SVG data-URI crosshair-plus), select = default arrow.
const DRAW_CURSOR =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><line x1='12' y1='3' x2='12' y2='21' stroke='black' stroke-width='1.5' stroke-dasharray='2 2'/><line x1='3' y1='12' x2='21' y2='12' stroke='black' stroke-width='1.5' stroke-dasharray='2 2'/></svg>\") 12 12, crosshair"

const surfaceCursor = computed(() => {
  if (editorUi.state.tool === 'hand') return 'grab'
  if (editorUi.state.tool === 'draw') return DRAW_CURSOR
  return 'default'
})
</script>

<template>
  <div
    ref="surface"
    :data-fdpreset="store.state.themePreset"
    :style="[themeStyle, { cursor: surfaceCursor }]"
    class="relative h-full w-full overflow-auto bg-[#EEEEF0]"
    @wheel.prevent="onWheel"
    @scroll="onScroll"
    @pointerdown="onSurfacePointerDown"
    @pointermove="onSurfacePointerMove"
    @pointerup="onSurfacePointerUp"
    @pointerleave="viewport.endPan()"
    @dblclick="onSurfaceDoubleClick"
    @dragover.prevent="creation.onCanvasDragOver"
    @drop="creation.onCanvasDrop"
  >
    <!-- Spacer sized to the pannable region so native scrollbars appear. -->
    <div :style="stageStyle" class="pointer-events-none" />

    <!-- The SVG is pinned to the viewport; the <g> transform handles pan/zoom. -->
    <svg class="pointer-events-none absolute left-0 top-0 h-full w-full">
      <g :transform="groupTransform" class="[&_*]:pointer-events-auto">
        <!-- Block mode: bounded white paper + shapes/connectors + overlays. -->
        <template v-if="!rendersOwnLayer">
          <!-- Soft paper shadow approximated with a slightly offset gray rect. -->
          <rect :x="2" :y="3" :width="canvas.width" :height="canvas.height" fill="rgba(0,0,0,0.06)" />
          <rect
            :width="canvas.width"
            :height="canvas.height"
            :fill="paperBackground"
            stroke="#E2E2E2"
            stroke-width="1"
          />

          <GridLayer
            v-if="editorUi.state.gridVisible"
            :width="canvas.width"
            :height="canvas.height"
            :density="editorUi.state.gridDensity"
          />

          <ConnectorView
            v-for="connector in store.state.connectors"
            :key="connector.id"
            :connector="connector"
          />

          <ShapeView v-for="shape in orderedShapes" :key="shape.id" :shape="shape" />

          <SmartGuidesLayer />
          <HoverArrows />
          <SelectionLayer />

          <!-- Dashed ghost of the shape/connector being drawn (spec §7.1). -->
          <rect
            v-if="creation.preview.value?.box"
            :x="creation.preview.value.x"
            :y="creation.preview.value.y"
            :width="creation.preview.value.w"
            :height="creation.preview.value.h"
            fill="none"
            stroke="#006EDB"
            stroke-width="1.5"
            stroke-dasharray="6 4"
          />
          <line
            v-else-if="creation.preview.value?.line"
            :x1="creation.preview.value.x1"
            :y1="creation.preview.value.y1"
            :x2="creation.preview.value.x2"
            :y2="creation.preview.value.y2"
            stroke="#006EDB"
            stroke-width="2"
            stroke-dasharray="6 4"
            stroke-linecap="round"
          />

          <TextEditor />
        </template>

        <!-- Mind-map mode: the laid-out tree (spec diagram-types Part A). -->
        <MindMapNodeLayer
          v-else-if="isMindmap && mindmapLayout"
          :mindmap="store.state.mindmap"
          :positions="mindmapLayout.positions"
        />

        <!-- Flowchart mode: typed nodes + orthogonal edges (spec Part B). -->
        <FlowchartLayer
          v-else-if="isFlowchart && store.state.flowchart"
          :flowchart="store.state.flowchart"
        />

        <!-- Whiteboard mode: strokes + stickies + objects (spec Part C). -->
        <WhiteboardLayer
          v-else-if="isWhiteboard && store.state.whiteboard"
          :whiteboard="store.state.whiteboard"
        />
      </g>
    </svg>

    <!-- Rulers in screen space (outside the viewport <g>), shown while editing
         text at any zoom (spec §6). -->
    <Rulers />
  </div>
</template>
