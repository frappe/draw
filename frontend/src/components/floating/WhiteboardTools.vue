<script setup>
// Whiteboard tool group for the bottom floating palette. The whiteboard has NO
// right panel (modeStrategies.showsRightPalette:false), so every control lives
// here. Tools ARM on a single click (so the next canvas action draws straight
// away — clicking a tool never steals the first stroke). Options for the active
// tool sit behind ONE separate "options" disclosure; board-wide settings and the
// selected-object editor follow. All chrome is Frappe UI.
import { computed } from 'vue'
import { Popover, Tooltip, FeatherIcon, Button } from 'frappe-ui'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { CHALK_COLORS, STICKY_COLORS, PEN_WIDTHS, BOARD_BACKGROUNDS } from '@/diagram/whiteboardColors.js'
import LineOptions from './LineOptions.vue'
import TableOptions from './TableOptions.vue'
import WhiteboardSelectionEditor from './WhiteboardSelectionEditor.vue'
import WhiteboardMinimap from '@/components/canvas/WhiteboardMinimap.vue'

const editorUi = useEditorUi()
const store = useDiagramStore()
const ui = useWhiteboardUi()

const TOOLS = [
  { tool: 'pen', icon: 'edit-2', label: 'Pen' },
  { tool: 'highlighter', icon: 'edit-3', label: 'Highlighter' },
  { tool: 'eraser', icon: 'delete', label: 'Eraser' },
  { tool: 'text', icon: 'type', label: 'Text (or double-click)' },
  { tool: 'sticky', icon: 'square', label: 'Sticky note' },
  { tool: 'line', icon: 'minus', label: 'Line' },
  { tool: 'table', icon: 'grid', label: 'Table' },
  { tool: 'laser', icon: 'zap', label: 'Laser pointer' },
]
// Tools that expose options in the disclosure popover.
const OPTION_TOOLS = ['pen', 'highlighter', 'sticky', 'line', 'table']

const activeTool = computed(() => editorUi.state.tool)
const activeHasOptions = computed(() => OPTION_TOOLS.includes(activeTool.value))
const optionsLabel = computed(() => `${capitalize(activeTool.value)} options`)
function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : ''
}

const buttonBase =
  'flex h-[34px] w-[34px] items-center justify-center rounded-md text-ink-gray-7 hover:bg-surface-gray-2'
function toggleClass(active) {
  return active ? 'bg-surface-gray-2 text-ink-gray-9' : ''
}

const boardBackground = () => store.state.canvas?.background || '#FFFFFF'
const sketchOn = () => Boolean(store.state.whiteboard?.sketchStyle)
function toggleSketch() {
  store.updateWhiteboardModel('Sketch style', (model) => (model.sketchStyle = !model.sketchStyle))
}

// New-line / new-table defaults live on ui.state; LineOptions/TableOptions emit a
// partial patch and these copy each present field onto the right default.
function applyLineDefault(patch) {
  const fields = { start: 'lineStart', end: 'lineEnd', color: 'penColor', width: 'penWidth' }
  for (const [key, target] of Object.entries(fields)) {
    if (patch[key] !== undefined) ui.state[target] = patch[key]
  }
}
function applyTableDefault(patch) {
  const fields = { rows: 'tableRows', cols: 'tableCols', color: 'penColor' }
  for (const [key, target] of Object.entries(fields)) {
    if (patch[key] !== undefined) ui.state[target] = patch[key]
  }
}
</script>

<template>
  <div class="mx-0.5 h-5 w-px bg-outline-gray-1" />

  <!-- Tools: a single click arms; the next canvas action draws. -->
  <Tooltip v-for="t in TOOLS" :key="t.tool" :text="t.label">
    <button :class="[buttonBase, toggleClass(activeTool === t.tool)]" @click="editorUi.setTool(t.tool)">
      <FeatherIcon :name="t.icon" class="h-4 w-4" />
    </button>
  </Tooltip>

  <!-- Options for the active tool (separate disclosure, shown only when it has any). -->
  <Popover v-if="activeHasOptions">
    <template #target="{ togglePopover }">
      <Tooltip :text="optionsLabel">
        <button :class="buttonBase" @click="togglePopover()">
          <FeatherIcon name="sliders" class="h-4 w-4" />
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
            <span class="rounded-full bg-ink-gray-9" :style="{ width: w + 'px', height: w + 'px' }" />
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

      <!-- Table: rows + cols + color. -->
      <TableOptions
        v-else-if="activeTool === 'table'"
        :rows="ui.state.tableRows"
        :cols="ui.state.tableCols"
        :color="ui.state.penColor"
        @change="applyTableDefault"
      />
    </template>
  </Popover>

  <!-- Board options: background + sketch + navigator. -->
  <div class="mx-0.5 h-5 w-px bg-outline-gray-1" />
  <Popover>
    <template #target="{ togglePopover }">
      <Tooltip text="Board options">
        <button :class="buttonBase" @click="togglePopover()">
          <FeatherIcon name="settings" class="h-4 w-4" />
        </button>
      </Tooltip>
    </template>
    <template #body-main>
      <div class="w-56 p-2">
        <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-5">Background</div>
        <div class="mb-3 flex gap-1.5">
          <button
            v-for="bg in BOARD_BACKGROUNDS"
            :key="bg.value"
            class="flex h-8 flex-1 items-center justify-center gap-2 rounded-md border text-xs"
            :class="boardBackground() === bg.value ? 'border-ink-gray-9 text-ink-gray-9' : 'border-outline-gray-2 text-ink-gray-7'"
            @click="store.setCanvas({ background: bg.value })"
          >
            <span class="h-4 w-4 rounded border border-black/20" :style="{ background: bg.value }" />
            {{ bg.label }}
          </button>
        </div>
        <Button class="mb-3 w-full" :variant="sketchOn() ? 'solid' : 'subtle'" @click="toggleSketch">
          {{ sketchOn() ? 'Sketch style: on' : 'Sketch style: off' }}
        </Button>
        <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-5">Navigator</div>
        <WhiteboardMinimap />
      </div>
    </template>
  </Popover>

  <!-- Contextual editor for the selected object. -->
  <WhiteboardSelectionEditor />
</template>
