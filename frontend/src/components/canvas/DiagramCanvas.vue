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
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { themeVarStyle } from '@/diagram/theme.js'
import { axisAlignedBBox } from '@/diagram/geometry.js'
import GridLayer from './GridLayer.vue'
import ShapeView from './ShapeView.vue'
import ConnectorView from './ConnectorView.vue'
import SmartGuidesLayer from './SmartGuidesLayer.vue'
import HoverArrows from './HoverArrows.vue'
import SelectionLayer from './SelectionLayer.vue'
import TextEditor from './TextEditor.vue'

const store = useDiagramStore()
const editorUi = useEditorUi()
const viewport = editorUi.viewport

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

// Screen-space rect the content occupies, given the current pan + zoom.
const contentRect = computed(() => {
  const extent = contentExtent.value
  const zoom = viewport.state.zoom
  return {
    left: viewport.state.panX + extent.x * zoom,
    top: viewport.state.panY + extent.y * zoom,
    width: extent.w * zoom,
    height: extent.h * zoom,
  }
})

// The spacer spans from the viewport top-left to the far edge of the content,
// growing past the viewport only when content sits beyond it — which is exactly
// when the browser should show scrollbars (spec §4.1).
const stageStyle = computed(() => {
  const rect = contentRect.value
  const width = Math.max(viewWidth.value, rect.left + rect.width)
  const height = Math.max(viewHeight.value, rect.top + rect.height)
  return { width: `${width}px`, height: `${height}px` }
})

// Feed container + canvas size to the viewport, then fit-to-view centered.
function fitToView() {
  if (!surface.value) return
  const bounds = surface.value.getBoundingClientRect()
  viewport.setMeasure({
    containerW: bounds.width,
    containerH: bounds.height,
    canvasW: canvas.value.width,
    canvasH: canvas.value.height,
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

// Keep the viewport's container measure current (without re-fitting).
function syncMeasure() {
  if (!surface.value) return
  const bounds = surface.value.getBoundingClientRect()
  viewport.setMeasure({ containerW: bounds.width, containerH: bounds.height })
}

// Re-fit when the canvas preset changes so the new paper opens centered.
watch(
  () => [canvas.value.width, canvas.value.height],
  () => nextTick(fitToView),
)

function pointerPosition(event) {
  const bounds = surface.value.getBoundingClientRect()
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
}

function onWheel(event) {
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
</script>

<template>
  <div
    ref="surface"
    :data-fdpreset="store.state.themePreset"
    :style="themeStyle"
    class="relative h-full w-full overflow-auto bg-[#EEEEF0]"
    :class="panning ? 'cursor-grab' : ''"
    @wheel.prevent="onWheel"
    @pointerdown="panning && viewport.startPan($event)"
    @pointermove="panning && viewport.movePan($event)"
    @pointerup="viewport.endPan()"
    @pointerleave="viewport.endPan()"
  >
    <!-- Spacer sized to the pannable region so native scrollbars appear. -->
    <div :style="stageStyle" class="pointer-events-none" />

    <!-- The SVG is pinned to the viewport; the <g> transform handles pan/zoom. -->
    <svg class="pointer-events-none absolute left-0 top-0 h-full w-full">
      <g :transform="groupTransform" class="[&_*]:pointer-events-auto">
        <!-- Soft paper shadow approximated with a slightly offset gray rect. -->
        <rect
          :x="2"
          :y="3"
          :width="canvas.width"
          :height="canvas.height"
          fill="rgba(0,0,0,0.06)"
        />
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
        <TextEditor />
      </g>
    </svg>
  </div>
</template>
