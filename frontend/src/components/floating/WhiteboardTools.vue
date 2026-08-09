<script setup>
// The live annotation tools — Draw, Eraser, Laser — as a group on the static
// canvas toolbar (#364). It rendered bare buttons for the bottom palette to
// place, so moving it up was mostly deleting that bar's leading divider. Tools ARM on a single click (so the
// next canvas action draws straight away — clicking a tool never steals the
// first stroke). Options for the active tool sit behind ONE separate "options"
// disclosure; board-wide settings and the selected-object editor follow. All
// chrome is Frappe UI.
import { computed, nextTick, ref } from 'vue'
import { Popover, Slider, TabButtons } from 'frappe-ui'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { CHALK_COLORS, STICKY_COLORS, PEN_WIDTHS } from '@/diagram/whiteboardColors.js'
import { ERASER_SIZES } from '@/diagram/eraser.js'
import { visibleWhiteboardTools } from './whiteboardTools.js'
import ToolbarButton from '@/components/toolbar/ToolbarButton.vue'
import LineOptions from './LineOptions.vue'
import TableSizePicker from './TableSizePicker.vue'
import { tableInsertOrigin } from './tableSizePicker.js'
import { useImageInsert } from '@/composables/useImageInsert.js'

// `exclude` hides tools the surrounding context already provides — on the unified
// canvas the block group owns text/line/image, so they're excluded here to avoid
// duplicate buttons and tool-name collisions.
const props = defineProps({
  exclude: { type: Array, default: () => [] },
})

const editorUi = useEditorUi()
const store = useDiagramStore()
const ui = useWhiteboardUi()
const imageInsert = useImageInsert(store)

// Tools that expose options in the disclosure popover. The table tool is absent:
// clicking it opens the size picker (which commits directly), so it never needs
// the separate options step (#134). 'pen' is the merged Draw tool (#242, see
// whiteboardTools.js for why its id stays 'pen' rather than 'draw').
const OPTION_TOOLS = ['pen', 'eraser', 'sticky', 'line']

// Eraser modes (#39). 'ink' is the classic whiteboard eraser — it takes only what
// the tip covers; 'object' takes the whole element under it, the only way to erase
// a table, sticky, shape or connector.
// `icon` holds the COMPLETE lucide utility class. Tailwind's JIT only emits
// classes it can read literally, so `lucide-${name}` produces no CSS.
const ERASER_MODES = [
  { key: 'ink', icon: 'lucide-eraser', label: 'Erase' },
  { key: 'object', icon: 'lucide-square-x', label: 'Erase by object' },
]
// TabButtons shape for the same list.
const ERASER_MODE_TABS = ERASER_MODES.map((m) => ({
  value: m.key,
  label: m.label,
  iconLeft: m.icon,
}))

const optionsPopoverRef = ref(null)

// Clicking the eraser tool also opens its options popover directly, so its
// size/settings are reachable from the tool itself rather than only via the
// separate "sliders" disclosure (#241). Only on the arm transition though, not on
// a repeat click of the already-active tool: clicking an armed tool must stay a
// no-op so an open options popover can be dismissed by clicking the tool again.
// The popover only mounts when the active tool has options (v-if="activeHasOptions"),
// so wait a tick before opening it in case the previous tool had none.
async function armTool(t) {
  const wasActive = editorUi.state.tool === t.tool
  editorUi.setTool(t.tool)
  if (t.tool === 'eraser' && !wasActive) {
    await nextTick()
    optionsPopoverRef.value?.open()
  }
}

// The Draw tool's pen/highlighter sub-modes (#242), styled like ERASER_MODES.
// `icon` holds the COMPLETE lucide utility class. Tailwind's JIT only emits
// classes it can read literally in the source, so building one with
// `lucide-${name}` produces no CSS and the icon renders blank.
const DRAW_KINDS = [
  { key: 'pen', icon: 'lucide-pen-line', label: 'Pen' },
  { key: 'highlighter', icon: 'lucide-highlighter', label: 'Highlighter' },
]
const DRAW_KIND_TABS = DRAW_KINDS.map((kind) => ({
  value: kind.key,
  label: kind.label,
  iconLeft: kind.icon,
}))

const activeTool = computed(() => editorUi.state.tool)
const visibleTools = computed(() => visibleWhiteboardTools(props.exclude))
const showImageInsert = computed(() => !props.exclude.includes('image'))
const activeHasOptions = computed(() => OPTION_TOOLS.includes(activeTool.value))
// 'pen' reads as "Draw options" (its display label), not "Pen options" — the tool
// id and the label it shows the user diverge on purpose (#242).
const optionsLabel = computed(() => `${activeTool.value === 'pen' ? 'Draw' : capitalize(activeTool.value)} options`)
function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : ''
}

// Slider works in whole numbers on a [min,max] array model; drawOpacity is a 0-1
// float, so this is the seam between the two. A global highlighter-opacity
// preference (not per-stroke, see useWhiteboardUi.js), so it's fine to keep the
// conversion local to this popover rather than threading percentages elsewhere.
const drawOpacityPercent = computed({
  get: () => [Math.round(ui.state.drawOpacity * 100)],
  set: (value) => {
    ui.state.drawOpacity = (value?.[0] ?? Math.round(ui.state.drawOpacity * 100)) / 100
  },
})

// The biggest tip is wider than the swatch row, so the preview dot is capped —
// the canvas cursor is what shows the true tip size.
function eraserDotStyle(size) {
  const dot = Math.min(size, 18)
  return { width: `${dot}px`, height: `${dot}px` }
}

// New-line defaults live on ui.state; LineOptions emits a partial patch and this
// copies each present field onto the right default.
function applyLineDefault(patch) {
  const fields = { start: 'lineStart', end: 'lineEnd', color: 'penColor', width: 'penWidth' }
  for (const [key, target] of Object.entries(fields)) {
    if (patch[key] !== undefined) ui.state[target] = patch[key]
  }
}

// Commit a table of the picked size: drop it centred in view, select it, and
// remember the size so the keyboard-armed quick-place uses the same one (#134).
function insertTable({ rows, cols }, close) {
  const origin = tableInsertOrigin(editorUi.viewport.visibleRect(), rows, cols)
  const id = store.addTable(origin.x, origin.y, { rows, cols, color: ui.state.penColor })
  if (id) {
    editorUi.setTool('select')
    ui.selectTable(id)
    ui.state.tableRows = rows
    ui.state.tableCols = cols
  }
  close?.()
}
</script>

<template>
  <!-- Tools: a single click arms; the next canvas action draws. The table tool is
       the exception — clicking it opens the size picker, which inserts on pick. -->
  <template v-for="t in visibleTools" :key="t.tool">
    <Popover v-if="t.tool === 'table'">
      <template #trigger>
        <ToolbarButton
          allows-blur
          :data-testid="'wtool-' + t.tool"
          :active="activeTool === t.tool"
          :icon="t.icon"
          :label="t.label"
        />
      </template>
      <template #default="{ toggle }">
        <TableSizePicker @pick="insertTable($event, toggle)" />
      </template>
    </Popover>
    <ToolbarButton
      v-else
      allows-blur
      :data-testid="'wtool-' + t.tool"
      :active="activeTool === t.tool"
      :icon="t.icon"
      :label="t.label"
      @click="armTool(t)"
    />
  </template>

  <!-- Insert image (action, not a tool). Hidden when the surrounding palette owns it. -->
  <ToolbarButton
    v-if="showImageInsert"
    allows-blur
    icon="lucide-image"
    label="Insert image"
    @click="imageInsert.pick(() => editorUi.viewport.centerPoint())"
  />

  <!-- Options for the active tool (separate disclosure, shown only when it has any).
       Also opened directly by the eraser tool button above (#241). -->
  <Popover v-if="activeHasOptions" ref="optionsPopoverRef">
    <template #trigger>
      <ToolbarButton icon="lucide-sliders-horizontal" :label="optionsLabel" />
    </template>
    <template #default>
      <!-- Draw (#242): pen/highlighter sub-mode picker, shared color, pen-only
           size (highlighter's width is the fixed HIGHLIGHTER_WIDTH constant, not
           a user control today), highlighter-only opacity. -->
      <div v-if="activeTool === 'pen'" class="w-48 p-2">
        <TabButtons v-model="ui.state.drawKind" class="mb-2" size="sm" :options="DRAW_KIND_TABS" />

        <div class="mb-1 text-sm font-semibold text-ink-gray-5">Color</div>
        <div class="mb-2 grid grid-cols-8 gap-1.5">
          <button
            v-for="c in CHALK_COLORS"
            :key="c"
            class="h-5 w-5 rounded-full border"
            :class="ui.state.penColor === c ? 'border-[1.5px] border-outline-gray-9' : 'border-outline-gray-2'"
            :style="{ background: c }"
            @click="ui.state.penColor = c"
          />
        </div>
        <template v-if="ui.state.drawKind === 'pen'">
          <div class="mb-1 text-sm font-semibold text-ink-gray-5">Size</div>
          <div class="flex gap-2">
            <button
              v-for="w in PEN_WIDTHS"
              :key="w"
              class="flex h-7 flex-1 items-center justify-center rounded-md"
              :class="ui.state.penWidth === w ? 'bg-surface-gray-3' : 'bg-surface-gray-1 hover:bg-surface-gray-2'"
              @click="ui.state.penWidth = w"
            >
              <span class="rounded-full bg-surface-gray-10" :style="{ width: w + 'px', height: w + 'px' }" />
            </button>
          </div>
        </template>
        <template v-else>
          <div class="mb-1 text-sm font-semibold text-ink-gray-5">Opacity</div>
          <Slider v-model="drawOpacityPercent" :min="10" :max="100" :step="5" size="sm" />
        </template>
      </div>

      <!-- Eraser: mode + tip size (#39). The canvas cursor shows the real tip. -->
      <div v-else-if="activeTool === 'eraser'" class="w-48 p-2">
        <div class="mb-1 text-2xs font-semibold text-ink-gray-5">Mode</div>
        <TabButtons v-model="ui.state.eraserMode" class="mb-2" size="sm" vertical :options="ERASER_MODE_TABS" />
        <div class="mb-1 text-2xs font-semibold text-ink-gray-5">Size</div>
        <div class="flex gap-2">
          <button
            v-for="size in ERASER_SIZES"
            :key="size"
            class="flex h-7 flex-1 items-center justify-center rounded-md"
            :class="ui.state.eraserSize === size ? 'bg-surface-gray-3' : 'bg-surface-gray-1 hover:bg-surface-gray-2'"
            @click="ui.state.eraserSize = size"
          >
            <span class="rounded-full bg-surface-gray-10" :style="eraserDotStyle(size)" />
          </button>
        </div>
      </div>


      <!-- Sticky: color. -->
      <div v-else-if="activeTool === 'sticky'" class="w-48 p-2">
        <div class="mb-1 text-2xs font-semibold text-ink-gray-5">Color</div>
        <div class="grid grid-cols-9 gap-1.5">
          <button
            v-for="c in STICKY_COLORS"
            :key="c"
            class="h-5 w-5 rounded-sm border"
            :class="ui.state.stickyColor === c ? 'border-[1.5px] border-outline-gray-9' : 'border-outline-gray-2'"
            :style="{ background: c }"
            @click="ui.state.stickyColor = c"
          />
        </div>
      </div>

      <!-- Line: endpoints + color + width. -->
      <LineOptions
        v-else-if="activeTool === 'line'"
        :start="ui.state.lineStart"
        :end="ui.state.lineEnd"
        :color="ui.state.penColor"
        :width="ui.state.penWidth"
        @change="applyLineDefault"
      />
    </template>
  </Popover>
</template>
