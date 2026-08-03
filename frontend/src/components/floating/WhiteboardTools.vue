<script setup>
// Whiteboard tool group for the bottom floating palette. The whiteboard has NO
// right panel, so every control lives here. Tools ARM on a single click (so the
// next canvas action draws straight away — clicking a tool never steals the
// first stroke). Options for the active tool sit behind ONE separate "options"
// disclosure; board-wide settings and the selected-object editor follow. All
// chrome is Frappe UI.
import { computed } from 'vue'
import { Popover, Tooltip } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { CHALK_COLORS, STICKY_COLORS, PEN_WIDTHS } from '@/diagram/whiteboardColors.js'
import { ERASER_SIZES } from '@/diagram/eraser.js'
import { visibleWhiteboardTools } from './whiteboardTools.js'
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
// the separate options step (#134).
const OPTION_TOOLS = ['pen', 'highlighter', 'eraser', 'sticky', 'line']

// Eraser modes (#39). 'ink' is the classic whiteboard eraser — it takes only what
// the tip covers; 'object' takes the whole element under it, the only way to erase
// a table, sticky, shape or connector.
const ERASER_MODES = [
  { key: 'ink', icon: 'eraser', label: 'Erase' },
  { key: 'object', icon: 'square-x', label: 'Erase by object' },
]

const activeTool = computed(() => editorUi.state.tool)
const visibleTools = computed(() => visibleWhiteboardTools(props.exclude))
const showImageInsert = computed(() => !props.exclude.includes('image'))
const activeHasOptions = computed(() => OPTION_TOOLS.includes(activeTool.value))
const optionsLabel = computed(() => `${capitalize(activeTool.value)} options`)
function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : ''
}

// The biggest tip is wider than the swatch row, so the preview dot is capped —
// the canvas cursor is what shows the true tip size.
function eraserDotStyle(size) {
  const dot = Math.min(size, 18)
  return { width: `${dot}px`, height: `${dot}px` }
}

const buttonBase =
  'flex h-[34px] w-[34px] items-center justify-center rounded-md text-ink-gray-7 hover:bg-surface-gray-2'
function toggleClass(active) {
  return active ? 'bg-surface-gray-2 text-ink-gray-9' : ''
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
  <div class="mx-0.5 h-5 w-px bg-surface-gray-3" />

  <!-- Tools: a single click arms; the next canvas action draws. The table tool is
       the exception — clicking it opens the size picker, which inserts on pick. -->
  <template v-for="t in visibleTools" :key="t.tool">
    <Popover v-if="t.tool === 'table'">
      <template #target="{ togglePopover: togglePicker }">
        <Tooltip :text="t.label">
          <button :data-testid="'wtool-' + t.tool" :class="[buttonBase, toggleClass(activeTool === t.tool)]" @click="togglePicker()">
            <LucideIcon :name="t.icon" class="h-4 w-4" />
          </button>
        </Tooltip>
      </template>
      <template #body-main="{ togglePopover }">
        <TableSizePicker @pick="insertTable($event, togglePopover)" />
      </template>
    </Popover>
    <Tooltip v-else :text="t.label">
      <button :data-testid="'wtool-' + t.tool" :class="[buttonBase, toggleClass(activeTool === t.tool)]" @click="editorUi.setTool(t.tool)">
        <LucideIcon :name="t.icon" class="h-4 w-4" />
      </button>
    </Tooltip>
  </template>

  <!-- Insert image (action, not a tool). Hidden when the surrounding palette owns it. -->
  <Tooltip v-if="showImageInsert" text="Insert image">
    <button :class="buttonBase" @click="imageInsert.pick()">
      <LucideIcon name="image" class="h-4 w-4" />
    </button>
  </Tooltip>

  <!-- Options for the active tool (separate disclosure, shown only when it has any). -->
  <Popover v-if="activeHasOptions">
    <template #target="{ togglePopover }">
      <Tooltip :text="optionsLabel">
        <button :class="buttonBase" @click="togglePopover()">
          <LucideIcon name="sliders" class="h-4 w-4" />
        </button>
      </Tooltip>
    </template>
    <template #body-main>
      <!-- Pen: color + width. -->
      <div v-if="activeTool === 'pen'" class="w-48 p-2">
        <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-5">Color</div>
        <div class="mb-2 grid grid-cols-8 gap-1.5">
          <button
            v-for="c in CHALK_COLORS"
            :key="c"
            class="h-5 w-5 rounded-full border"
            :class="ui.state.penColor === c ? 'border-[1.5px] border-ink-gray-9' : 'border-outline-gray-2'"
            :style="{ background: c }"
            @click="ui.state.penColor = c"
          />
        </div>
        <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-5">Width</div>
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
      </div>

      <!-- Eraser: mode + tip size (#39). The canvas cursor shows the real tip. -->
      <div v-else-if="activeTool === 'eraser'" class="w-48 p-2">
        <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-5">Mode</div>
        <div class="mb-2 flex flex-col gap-1">
          <button
            v-for="m in ERASER_MODES"
            :key="m.key"
            class="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-gray-2"
            :class="ui.state.eraserMode === m.key ? 'bg-surface-gray-2 text-ink-gray-9' : 'text-ink-gray-7'"
            @click="ui.state.eraserMode = m.key"
          >
            <LucideIcon :name="m.icon" class="h-4 w-4 text-ink-gray-6" />
            {{ m.label }}
            <LucideIcon v-if="ui.state.eraserMode === m.key" name="check" class="ml-auto h-4 w-4 text-ink-gray-9" />
          </button>
        </div>
        <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-5">Size</div>
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

      <!-- Highlighter: color. -->
      <div v-else-if="activeTool === 'highlighter'" class="w-48 p-2">
        <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-5">Color</div>
        <div class="grid grid-cols-8 gap-1.5">
          <button
            v-for="c in CHALK_COLORS"
            :key="c"
            class="h-5 w-5 rounded-full border"
            :class="ui.state.penColor === c ? 'border-[1.5px] border-ink-gray-9' : 'border-outline-gray-2'"
            :style="{ background: c }"
            @click="ui.state.penColor = c"
          />
        </div>
      </div>

      <!-- Sticky: color. -->
      <div v-else-if="activeTool === 'sticky'" class="w-48 p-2">
        <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-5">Color</div>
        <div class="grid grid-cols-9 gap-1.5">
          <button
            v-for="c in STICKY_COLORS"
            :key="c"
            class="h-5 w-5 rounded-sm border"
            :class="ui.state.stickyColor === c ? 'border-[1.5px] border-ink-gray-9' : 'border-outline-gray-2'"
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
