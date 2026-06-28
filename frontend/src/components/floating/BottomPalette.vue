<script setup>
// Floating bottom-center palette (spec §7.1, README 4c): pointer modes (select /
// hand / draw), grid-guide toggle, and zoom controls (out / 100% reset / in /
// fit). Wired to editorUi tool/grid and the viewport.
import { computed, ref, nextTick } from 'vue'
import { Tooltip, FeatherIcon, Popover } from 'frappe-ui'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useModeStrategy } from '@/stores/useModeStrategy.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useImageInsert } from '@/composables/useImageInsert.js'
import WhiteboardTools from './WhiteboardTools.vue'

const editorUi = useEditorUi()
const viewport = editorUi.viewport
const modeStrategy = useModeStrategy()
const imageInsert = useImageInsert(useDiagramStore())

// Block diagrams create from here (no left palette). A categorised popover of
// shapes + a connectors popover + a text tool, each arming draw mode.
const isBlock = computed(() => modeStrategy?.value?.type === 'block')
const isWhiteboard = computed(() => modeStrategy?.value?.type === 'whiteboard')
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

function arm(type, close) {
  editorUi.setDrawShape(type)
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
  { tool: 'hand', icon: 'move', label: 'Pan' },
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

// Click the zoom % to type an exact value (spec 1.6).
const zoomEditing = ref(false)
const zoomDraft = ref('')
const zoomInput = ref(null)
function startZoomEdit() {
  zoomDraft.value = String(editorUi.zoomPercent)
  zoomEditing.value = true
  nextTick(() => {
    zoomInput.value?.focus()
    zoomInput.value?.select()
  })
}
function commitZoom() {
  if (!zoomEditing.value) return
  zoomEditing.value = false
  editorUi.setZoomPercent(zoomDraft.value)
}
</script>

<template>
  <div
    class="absolute bottom-[18px] left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-[10px] border border-outline-gray-1 bg-surface-white p-[5px] shadow-lg"
  >
    <Tooltip v-for="mode in modes" :key="mode.tool" :text="mode.label">
      <button
        :class="[buttonBase, toggleClass(editorUi.state.tool === mode.tool)]"
        @click="editorUi.setTool(mode.tool)"
      >
        <FeatherIcon :name="mode.icon" class="h-4 w-4" />
      </button>
    </Tooltip>

    <!-- Block creation tools: Shapes + Connectors popovers + Text. -->
    <template v-if="isBlock">
      <div class="mx-0.5 h-5 w-px bg-outline-gray-1" />
      <Popover>
        <template #target="{ togglePopover }">
          <Tooltip text="Shapes">
            <button :class="buttonBase" @click="togglePopover()"><FeatherIcon name="square" class="h-4 w-4" /></button>
          </Tooltip>
        </template>
        <template #body-main="{ togglePopover }">
          <div class="w-[176px] p-2">
            <input
              v-model="shapeQuery"
              type="text"
              placeholder="Search shapes…"
              class="mb-2 h-7 w-full rounded-md border border-outline-gray-2 bg-surface-white px-2 text-xs text-ink-gray-8 outline-none placeholder:text-ink-gray-4 focus:border-outline-gray-3"
            />
            <div v-if="filteredShapes.length" class="grid grid-cols-4 gap-1">
              <Tooltip v-for="s in filteredShapes" :key="s.type" :text="s.label">
                <button
                  class="flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-gray-2"
                  :class="isArmed(s.type) ? 'bg-surface-gray-2 text-ink-gray-9' : 'text-ink-gray-7'"
                  @click="arm(s.type, togglePopover)"
                >
                  <FeatherIcon :name="s.icon" class="h-[18px] w-[18px]" :class="s.type === 'diamond' ? 'rotate-45' : ''" />
                </button>
              </Tooltip>
            </div>
            <!-- Lines + connectors live here too (no separate menu). -->
            <div v-if="filteredShapes.length && filteredLines.length" class="my-2 h-px bg-outline-gray-1" />
            <div v-if="filteredLines.length" class="grid grid-cols-4 gap-1">
              <Tooltip v-for="con in filteredLines" :key="con.type" :text="con.label">
                <button
                  class="flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-gray-2"
                  :class="isArmed(con.type) ? 'bg-surface-gray-2 text-ink-gray-9' : 'text-ink-gray-7'"
                  @click="arm(con.type, togglePopover)"
                >
                  <FeatherIcon :name="con.icon" class="h-[18px] w-[18px]" />
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
          <FeatherIcon name="type" class="h-4 w-4" />
        </button>
      </Tooltip>
      <Tooltip text="Insert image">
        <button :class="buttonBase" @click="imageInsert.pick()">
          <FeatherIcon name="image" class="h-4 w-4" />
        </button>
      </Tooltip>
    </template>

    <!-- Whiteboard: full tool set + every control (no right panel). -->
    <WhiteboardTools v-if="isWhiteboard" />

    <!-- Any other type that declares extra surface tools (seam; none today). -->
    <template v-else-if="surfaceTools.length">
      <div class="mx-0.5 h-5 w-px bg-outline-gray-1" />
      <Tooltip v-for="modeTool in surfaceTools" :key="modeTool.tool" :text="modeTool.label">
        <button
          :class="[buttonBase, toggleClass(editorUi.state.tool === modeTool.tool)]"
          @click="editorUi.setTool(modeTool.tool)"
        >
          <FeatherIcon :name="modeTool.icon" class="h-4 w-4" />
        </button>
      </Tooltip>
    </template>

    <div class="mx-0.5 h-5 w-px bg-outline-gray-1" />

    <Tooltip :text="guidesLabel">
      <button
        :class="[buttonBase, toggleClass(guidesState !== 'no')]"
        @click="cycleGuides()"
      >
        <FeatherIcon :name="guidesState === 'rare' ? 'more-horizontal' : 'grid'" class="h-4 w-4" />
      </button>
    </Tooltip>

    <div class="mx-0.5 h-5 w-px bg-outline-gray-1" />

    <Tooltip text="Zoom out">
      <button :class="buttonBase" @click="viewport.zoomStep(-1)">
        <FeatherIcon name="minus" class="h-4 w-4" />
      </button>
    </Tooltip>
    <input
      v-if="zoomEditing"
      ref="zoomInput"
      v-model="zoomDraft"
      type="text"
      inputmode="numeric"
      class="h-[34px] w-[52px] rounded-md border border-outline-gray-2 bg-surface-white text-center text-xs font-medium text-ink-gray-8 outline-none focus:border-outline-gray-3"
      @keydown.enter="commitZoom"
      @keydown.esc="zoomEditing = false"
      @blur="commitZoom"
    />
    <Tooltip v-else text="Click to set zoom (⌘0 = 100%, ⇧1 = fit)">
      <button
        class="h-[34px] min-w-[46px] rounded-md px-1.5 text-xs font-medium text-ink-gray-7 hover:bg-surface-gray-2"
        @click="startZoomEdit"
      >
        {{ editorUi.zoomPercent }}%
      </button>
    </Tooltip>
    <Tooltip text="Zoom in">
      <button :class="buttonBase" @click="viewport.zoomStep(1)">
        <FeatherIcon name="plus" class="h-4 w-4" />
      </button>
    </Tooltip>
    <Tooltip text="Fit to view">
      <button :class="buttonBase" @click="editorUi.fit()">
        <FeatherIcon name="maximize-2" class="h-4 w-4" />
      </button>
    </Tooltip>
  </div>
</template>
