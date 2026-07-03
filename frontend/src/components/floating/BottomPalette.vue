<script setup>
// Floating bottom-center palette (spec §7.1, README 4c): pointer modes (select /
// hand), per-type creation + map tools, and the guides toggle. Zoom + fit live
// in the separate bottom-left ViewportControls. Wired to editorUi + the viewport.
import { computed, ref } from 'vue'
import { Tooltip, Popover } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useModeStrategy } from '@/stores/useModeStrategy.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useImageInsert } from '@/composables/useImageInsert.js'
import { recentShapes, pushRecentShape } from '@/composables/useRecentShapes.js'
import { collapseAll, clearMap } from '@/diagram/mindmapOperations.js'
import { autoNumberFlow, isFlowNumbered } from '@/diagram/flowchartModel.js'
import { tidyLayout, toggleDirection } from '@/diagram/flowchartLayout.js'
import WhiteboardTools from './WhiteboardTools.vue'
import CanvasSection from '@/components/palette-right/CanvasSection.vue'

const editorUi = useEditorUi()
const viewport = editorUi.viewport
const modeStrategy = useModeStrategy()
const store = useDiagramStore()
const imageInsert = useImageInsert(store)

// Block diagrams create from here (no left palette). A categorised popover of
// shapes + a connectors popover + a text tool, each arming draw mode.
const isBlock = computed(() => modeStrategy?.value?.type === 'block')
const isWhiteboard = computed(() => modeStrategy?.value?.type === 'whiteboard')
const isMindmap = computed(() => modeStrategy?.value?.type === 'mindmap')
const isFlowchart = computed(() => modeStrategy?.value?.type === 'flowchart')

// Map-wide flowchart actions (per-node editing lives in the floating toolbar).
const flowDirection = computed(() => store.state.flowchart?.direction || 'TB')
const flowNumbered = computed(() => (store.state.flowchart ? isFlowNumbered(store.state.flowchart) : false))
function flowTidy() {
  editorUi.pulseLayoutAnimation()
  store.updateFlowchartModel('Tidy up', (m) => tidyLayout(m))
}
function flowFlip() {
  editorUi.pulseLayoutAnimation()
  store.updateFlowchartModel('Flow direction', (m) => toggleDirection(m))
}
function flowNumber() {
  store.updateFlowchartModel('Number steps', (m) => autoNumberFlow(m))
}

// Add a named section at the centre of the current view (works in every type).
function addSection() {
  const surface = document.querySelector('[data-fdpreset]')
  const rect = surface ? surface.getBoundingClientRect() : { width: 1000, height: 700 }
  const { panX, panY, zoom } = viewport.state
  const w = 360
  const h = 240
  const cx = (-panX + rect.width / 2) / zoom
  const cy = (-panY + rect.height / 2) / zoom
  const id = store.addSection(Math.round(cx - w / 2), Math.round(cy - h / 2), w, h)
  editorUi.selectSection(id)
}
const SHAPES = [
  { type: 'rectangle', icon: 'square', label: 'Rectangle' },
  { type: 'rounded', icon: 'square', label: 'Rounded rectangle' },
  { type: 'ellipse', icon: 'circle', label: 'Ellipse' },
  { type: 'triangle', icon: 'triangle', label: 'Triangle' },
  { type: 'diamond', icon: 'square', label: 'Diamond' },
  { type: 'pentagon', icon: 'hexagon', label: 'Pentagon' },
  { type: 'hexagon', icon: 'hexagon', label: 'Hexagon' },
  { type: 'star', icon: 'star', label: 'Star' },
  { type: 'arrow', icon: 'arrow-right', label: 'Block arrow' },
  { type: 'cylinder', icon: 'database', label: 'Cylinder' },
  { type: 'callout', icon: 'message-square', label: 'Callout' },
]
// Lines/connectors now live inside the Shapes popover (no separate menu). A
// plain Line has no arrowheads; Arrow ends in an arrow; elbow/curved too.
const LINES = [
  { type: 'line', icon: 'minus', label: 'Line' },
  { type: 'arrow', icon: 'arrow-right', label: 'Arrow' },
  { type: 'elbow', icon: 'corner-down-right', label: 'Elbow connector' },
  { type: 'curved', icon: 'git-commit', label: 'Curved connector' },
]
// Filter shapes + lines by a search query (spec 2.1). Empty query shows all.
const shapeQuery = ref('')
const query = computed(() => shapeQuery.value.trim().toLowerCase())
const filteredShapes = computed(() =>
  query.value ? SHAPES.filter((s) => s.label.toLowerCase().includes(query.value)) : SHAPES,
)
const filteredLines = computed(() =>
  query.value ? LINES.filter((l) => l.label.toLowerCase().includes(query.value)) : LINES,
)

// Recently-used shapes/lines, shown as a row at the top of the popover (2.3).
const byType = computed(() => Object.fromEntries([...SHAPES, ...LINES].map((s) => [s.type, s])))
const recentShapeDefs = computed(() =>
  recentShapes.value.map((type) => byType.value[type]).filter(Boolean),
)

function arm(type, close) {
  editorUi.setDrawShape(type)
  pushRecentShape(type)
  shapeQuery.value = ''
  close?.()
}
function isArmed(type) {
  return editorUi.state.tool === 'draw' && editorUi.state.drawShapeType === type
}

// Just the two universal pointer modes. The generic "Draw" plus was removed: it
// duplicated the zoom-in "+" and is redundant with the left palette (block) and
// the per-type surface tools below (whiteboard).
const modes = [
  { tool: 'select', icon: 'mouse-pointer', label: 'Select' },
  { tool: 'hand', icon: 'hand', label: 'Hand' },
]

// Mode-specific tool seam (spec diagram-types C6): the active strategy may
// declare extra pointer modes (whiteboard pen/highlighter/eraser/text/sticky/
// laser). They render as additional buttons that set editorUi.state.tool; the
// type's mode-interaction composable acts on the selected tool.
const surfaceTools = computed(() => modeStrategy?.value?.surfaceTools || [])

const buttonBase =
  'flex h-[34px] w-[34px] items-center justify-center rounded-md text-ink-gray-7 hover:bg-surface-gray-2'

function toggleClass(active) {
  return active ? 'bg-surface-gray-2 text-ink-gray-9' : ''
}

// Dotted guides cycle through three states: No → Rare → Dense → No.
const guidesState = computed(() => {
  if (!editorUi.state.gridVisible) return 'no'
  return editorUi.state.gridDensity === 'sparse' ? 'rare' : 'dense'
})
const guidesLabel = computed(() =>
  ({ no: 'Guides: off', rare: 'Guides: rare', dense: 'Guides: dense' })[guidesState.value],
)
function cycleGuides() {
  const next = { no: 'rare', rare: 'dense', dense: 'no' }[guidesState.value]
  editorUi.state.gridVisible = next !== 'no'
  if (next === 'rare') editorUi.setGridDensity('sparse')
  if (next === 'dense') editorUi.setGridDensity('dense')
}
</script>

<template>
  <div
    class="absolute bottom-[18px] left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-[10px] border border-outline-gray-1 bg-surface-base p-[5px] shadow-lg"
  >
    <Tooltip v-for="mode in modes" :key="mode.tool" :text="mode.label">
      <button
        :class="[buttonBase, toggleClass(editorUi.state.tool === mode.tool)]"
        @click="editorUi.setTool(mode.tool)"
      >
        <LucideIcon :name="mode.icon" class="h-4 w-4" />
      </button>
    </Tooltip>

    <!-- Section (named grouping frame) — available in every diagram type. -->
    <div class="mx-0.5 h-5 w-px bg-surface-gray-3" />
    <Tooltip text="Add section">
      <button :class="buttonBase" @click="addSection"><LucideIcon name="layout" class="h-4 w-4" /></button>
    </Tooltip>

    <!-- Block creation tools: Shapes + Connectors popovers + Text. -->
    <template v-if="isBlock">
      <div class="mx-0.5 h-5 w-px bg-surface-gray-3" />
      <Popover>
        <template #target="{ togglePopover }">
          <Tooltip text="Shapes">
            <button :class="buttonBase" @click="togglePopover()"><LucideIcon name="square" class="h-4 w-4" /></button>
          </Tooltip>
        </template>
        <template #body-main="{ togglePopover }">
          <div class="w-[176px] p-2">
            <input
              v-model="shapeQuery"
              type="text"
              placeholder="Search shapes…"
              class="mb-2 h-7 w-full rounded-md border border-outline-gray-2 bg-surface-base px-2 text-xs text-ink-gray-8 outline-none placeholder:text-ink-gray-4 focus:border-outline-gray-3"
            />
            <!-- Recently used (hidden while searching). -->
            <template v-if="!query && recentShapeDefs.length">
              <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-4">Recent</div>
              <div class="mb-2 grid grid-cols-4 gap-1">
                <Tooltip v-for="s in recentShapeDefs" :key="`r-${s.type}`" :text="s.label">
                  <button
                    class="flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-gray-2"
                    :class="isArmed(s.type) ? 'bg-surface-gray-2 text-ink-gray-9' : 'text-ink-gray-7'"
                    @click="arm(s.type, togglePopover)"
                  >
                    <LucideIcon :name="s.icon" class="h-[18px] w-[18px]" :class="s.type === 'diamond' ? 'rotate-45' : ''" />
                  </button>
                </Tooltip>
              </div>
              <div class="mb-2 h-px bg-surface-gray-3" />
            </template>
            <div v-if="filteredShapes.length" class="grid grid-cols-4 gap-1">
              <Tooltip v-for="s in filteredShapes" :key="s.type" :text="s.label">
                <button
                  class="flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-gray-2"
                  :class="isArmed(s.type) ? 'bg-surface-gray-2 text-ink-gray-9' : 'text-ink-gray-7'"
                  @click="arm(s.type, togglePopover)"
                >
                  <LucideIcon :name="s.icon" class="h-[18px] w-[18px]" :class="s.type === 'diamond' ? 'rotate-45' : ''" />
                </button>
              </Tooltip>
            </div>
            <!-- Lines + connectors live here too (no separate menu). -->
            <div v-if="filteredShapes.length && filteredLines.length" class="my-2 h-px bg-surface-gray-3" />
            <div v-if="filteredLines.length" class="grid grid-cols-4 gap-1">
              <Tooltip v-for="con in filteredLines" :key="con.type" :text="con.label">
                <button
                  class="flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-gray-2"
                  :class="isArmed(con.type) ? 'bg-surface-gray-2 text-ink-gray-9' : 'text-ink-gray-7'"
                  @click="arm(con.type, togglePopover)"
                >
                  <LucideIcon :name="con.icon" class="h-[18px] w-[18px]" />
                </button>
              </Tooltip>
            </div>
            <p v-if="!filteredShapes.length && !filteredLines.length" class="px-1 py-2 text-center text-xs text-ink-gray-4">
              No matches
            </p>
          </div>
        </template>
      </Popover>
      <Tooltip text="Text">
        <button :class="[buttonBase, toggleClass(isArmed('text'))]" @click="arm('text')">
          <LucideIcon name="type" class="h-4 w-4" />
        </button>
      </Tooltip>
      <Tooltip text="Insert image">
        <button :class="buttonBase" @click="imageInsert.pick()">
          <LucideIcon name="image" class="h-4 w-4" />
        </button>
      </Tooltip>
      <!-- Canvas settings (size / theme / grid) — moved here from the old right panel. -->
      <Popover>
        <template #target="{ togglePopover }">
          <Tooltip text="Canvas settings">
            <button :class="buttonBase" @click="togglePopover()"><LucideIcon name="settings" class="h-4 w-4" /></button>
          </Tooltip>
        </template>
        <template #body-main>
          <div class="max-h-[70vh] w-[264px] overflow-y-auto"><CanvasSection /></div>
        </template>
      </Popover>
    </template>

    <!-- Mind map: map-wide actions (per-node editing is in the floating toolbar). -->
    <template v-if="isMindmap">
      <div class="mx-0.5 h-5 w-px bg-surface-gray-3" />
      <Tooltip text="Collapse all">
        <button :class="buttonBase" @click="collapseAll(store, true)"><LucideIcon name="minimize-2" class="h-4 w-4" /></button>
      </Tooltip>
      <Tooltip text="Expand all">
        <button :class="buttonBase" @click="collapseAll(store, false)"><LucideIcon name="maximize-2" class="h-4 w-4" /></button>
      </Tooltip>
      <Tooltip text="Clear map">
        <button :class="[buttonBase, 'hover:text-red-600']" @click="clearMap(store)"><LucideIcon name="trash-2" class="h-4 w-4" /></button>
      </Tooltip>
    </template>

    <!-- Flowchart: map-wide layout actions (per-node editing is in the floating toolbar). -->
    <template v-if="isFlowchart">
      <div class="mx-0.5 h-5 w-px bg-surface-gray-3" />
      <Tooltip text="Tidy up">
        <button :class="buttonBase" @click="flowTidy"><LucideIcon name="grid" class="h-4 w-4" /></button>
      </Tooltip>
      <Tooltip :text="flowDirection === 'TB' ? 'Top → bottom' : 'Left → right'">
        <button :class="buttonBase" @click="flowFlip"><LucideIcon :name="flowDirection === 'TB' ? 'arrow-down' : 'arrow-right'" class="h-4 w-4" /></button>
      </Tooltip>
      <Tooltip :text="flowNumbered ? 'Clear numbers' : 'Number steps'">
        <button :class="[buttonBase, toggleClass(flowNumbered)]" @click="flowNumber"><LucideIcon name="list" class="h-4 w-4" /></button>
      </Tooltip>
    </template>

    <!-- Whiteboard: full tool set + every control (no right panel). -->
    <WhiteboardTools v-if="isWhiteboard" />

    <!-- Any other type that declares extra surface tools (seam; none today). -->
    <template v-else-if="surfaceTools.length">
      <div class="mx-0.5 h-5 w-px bg-surface-gray-3" />
      <Tooltip v-for="modeTool in surfaceTools" :key="modeTool.tool" :text="modeTool.label">
        <button
          :class="[buttonBase, toggleClass(editorUi.state.tool === modeTool.tool)]"
          @click="editorUi.setTool(modeTool.tool)"
        >
          <LucideIcon :name="modeTool.icon" class="h-4 w-4" />
        </button>
      </Tooltip>
    </template>

    <!-- Guides: hidden on the whiteboard (it's a plain white board, Q4). -->
    <template v-if="!isWhiteboard">
      <div class="mx-0.5 h-5 w-px bg-surface-gray-3" />
      <Tooltip :text="guidesLabel">
        <button
          :class="[buttonBase, toggleClass(guidesState !== 'no')]"
          @click="cycleGuides()"
        >
          <LucideIcon :name="guidesState === 'rare' ? 'more-horizontal' : 'grid'" class="h-4 w-4" />
        </button>
      </Tooltip>
    </template>

  </div>
</template>
