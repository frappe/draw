<script setup>
// The live annotation tools — Draw, Eraser, Laser — as a group on the static
// canvas toolbar (#364). It rendered bare buttons for the bottom palette to
// place, so moving it up was mostly deleting that bar's leading divider. Tools
// ARM AND OPEN on a single click: a tool with options is its own Popover
// trigger, so arming it and revealing its size/color/etc. controls happen
// together, and clicking the same tool again toggles the popover shut — no
// separate "options" disclosure to reach for. Board-wide settings and
// the selected-object editor follow. All chrome is Frappe UI.
import { computed, ref } from 'vue'
import { Button, Dialog, Popover, Slider, Tooltip, TooltipProvider } from 'frappe-ui'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { STICKY_COLORS, PEN_WIDTHS, HIGHLIGHTER_WIDTHS } from '@/diagram/whiteboardColors.js'
import { INK_ROW, nearestSwatch } from '@/diagram/espressoPalette.js'
import { ERASER_SIZES } from '@/diagram/eraser.js'
import { dotStyle } from '@/diagram/sizeDot.js'
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
const imageInsert = useImageInsert(store, editorUi)

// Tools that carry their own options popover, opened by clicking the tool
// itself. The table tool is absent: clicking it opens the size picker (which
// commits directly), so it never arms or needs a persistent options popover
// (#134). 'pen' is the merged Draw tool (#242, see whiteboardTools.js for why
// its id stays 'pen' rather than 'draw').
const OPTION_TOOLS = ['pen', 'eraser', 'sticky', 'line']

// Eraser modes (#39). 'ink' is the classic whiteboard eraser — it takes only what
// the tip covers; 'object' takes the whole element under it, the only way to erase
// a table, sticky, shape or connector.
// `icon` holds the COMPLETE lucide utility class. Tailwind's JIT only emits
// classes it can read literally, so `lucide-${name}` produces no CSS.
const ERASER_MODES = [
  { key: 'ink', icon: 'lucide-eraser', label: 'Eraser' },
  { key: 'object', icon: 'lucide-square-x', label: 'Erase by object' },
]

// The three tip sizes as named rows (#462). Their dots are Lucide icons of visibly
// different weights rather than a hand-drawn size preview, which is what retires the
// frappe-ui-exempt swatch row this menu used to carry — and the names say which is
// which without asking anyone to compare three dots.
const ERASER_SIZE_LABELS = ['Small', 'Medium', 'Large']
const ERASER_SIZE_ICONS = ['lucide-dot', 'lucide-circle-small', 'lucide-circle']

// The Draw tool's pen/highlighter sub-modes (#242): two icon cells, the same
// control the connector menu's rows use.
//
// It was a frappe-ui TabButtons, which hard-codes `:title` internally — the
// unstyleable native browser tooltip, drawn by the OS wherever the pointer is and
// about a second late (#497). Nothing a consumer passes can change that, so the
// only way off it is off the component. This was the last one in the app.
//
// `icon` holds the COMPLETE lucide utility class. Tailwind's JIT only emits
// classes it can read literally in the source, so building one with
// `lucide-${name}` produces no CSS and the icon renders blank.
const DRAW_KINDS = [
  { key: 'pen', icon: 'lucide-pen-line', label: 'Pen' },
  { key: 'highlighter', icon: 'lucide-highlighter', label: 'Highlighter' },
]

const activeTool = computed(() => editorUi.state.tool)
const visibleTools = computed(() => visibleWhiteboardTools(props.exclude))
const showImageInsert = computed(() => !props.exclude.includes('image'))

// Pen and highlighter each keep their own width/opacity preference, so
// switching sub-mode never carries one ink's settings onto the other. These
// pick the pair the Draw popover reads and writes for whichever is active.
// Which ink to ring, matching how the full grid decides (#495): the exact swatch
// when the stored colour is one, else the nearest. The default ink is gray-900,
// which is deliberately not a swatch, and an older diagram can hold any value at
// all — string matching would leave the row looking unset on a pen that plainly
// has a colour. Nothing is rewritten; the ring only says "closest to this".
const ringedInk = computed(() => nearestSwatch(ui.state.penColor, INK_ROW.map((ink) => ink.hex)))

const activeDrawWidths = computed(() => (ui.state.drawKind === 'highlighter' ? HIGHLIGHTER_WIDTHS : PEN_WIDTHS))
const activeDrawWidthKey = computed(() => (ui.state.drawKind === 'highlighter' ? 'highlighterWidth' : 'penWidth'))
const activeDrawOpacityKey = computed(() => (ui.state.drawKind === 'highlighter' ? 'highlighterOpacity' : 'penOpacity'))

// Slider works in whole numbers on a [min,max] array model; the opacity state is
// a 0-1 float, so this is the seam between the two.
const drawOpacityPercent = computed({
  get: () => [Math.round(ui.state[activeDrawOpacityKey.value] * 100)],
  set: (value) => {
    const current = Math.round(ui.state[activeDrawOpacityKey.value] * 100)
    ui.state[activeDrawOpacityKey.value] = (value?.[0] ?? current) / 100
  },
})

// The eraser's options read as a MENU (#462): Eraser, Erase by object, Clear all.
//
// It stays a Popover, like every other option tool, rather than becoming a
// Dropdown. frappe-ui's Dropdown is reka's MODAL menu and does not expose the
// `modal` prop, so while it was open nothing else on screen responded — not the
// canvas, not another tool, not even the eraser's own button. The toolbar's
// one-click tool swap and the "arm and use" gesture both died with it.
//
// The tip sizes therefore open IN PLACE rather than as a true side menu, swapping
// this panel's contents — the same trick the Shapes menu uses for its side-count
// prompt, and for the same reason: a second Popover nested in this one would close
// the outer on its own outside-press.
const eraserSizesOpen = ref(false)

// The tool that was active before the Eraser button was clicked. Opening the
// button's popover arms Eraser (openEraserMenu below), same as every other
// OPTION_TOOLS trigger — but that popover also holds "Clear all", which is an
// action, not an eraser mode. Restoring this in clearAll() is what keeps
// Clear All from leaving Eraser armed behind it (#544).
let toolBeforeEraserMenu = 'select'
function openEraserMenu() {
  if (activeTool.value !== 'eraser') toolBeforeEraserMenu = activeTool.value
  editorUi.setTool('eraser')
}

// The trigger's own click-to-arm (#544): every OPTION_TOOLS button arms its
// tool on click, but the eraser's trigger goes through openEraserMenu instead,
// which is what lets clearAll() find its way back to the tool that was active
// before the eraser's menu (and its "Clear all" entry) was ever opened.
function armOptionTool(tool) {
  if (tool === 'eraser') openEraserMenu()
  else editorUi.setTool(tool)
}

// Picking a mode arms the eraser as well as setting it, so choosing one from the
// menu does not leave the previous tool live under the pointer.
function armEraser(mode) {
  ui.state.eraserMode = mode
  editorUi.setTool('eraser')
  eraserSizesOpen.value = false
}

function pickEraserSize(size) {
  ui.state.eraserSize = size
  armEraser('ink')
}

// Clearing the canvas cannot be undone by pressing the same button again, so it
// asks first — the same confirm the mind map's own clear-all uses. It restores
// whatever tool was active before the Eraser menu was opened (#544) — Clear all
// is a one-shot action, not a reason to leave Eraser armed.
const confirmingClearAll = ref(false)
function clearAll() {
  store.clearCanvas()
  editorUi.setTool(toolBeforeEraserMenu)
  confirmingClearAll.value = false
}

// The size preview dot: see diagram/sizeDot.js for the scaling rule. The scale is
// per ROW, so pen and highlighter draw the same three dots for different real
// widths — acceptable, because the toggle above the row already says which ink is
// in play, and this control's job is to separate ITS three sizes.

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
       the exception — clicking it opens the size picker, which inserts on pick.
       An OPTION_TOOLS button is itself a Popover trigger, so arming and opening
       its options happen on the same click, and a repeat click toggles the
       popover shut. -->
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

    <Popover v-else-if="OPTION_TOOLS.includes(t.tool)">
      <template #trigger>
        <ToolbarButton
          allows-blur
          :data-testid="'wtool-' + t.tool"
          :active="activeTool === t.tool"
          :icon="t.icon"
          :label="t.label"
          @click="armOptionTool(t.tool)"
        />
      </template>
      <template #default>
        <!-- Draw (#242): pen/highlighter sub-mode picker, shared color,
             and a size + opacity pair that belongs to whichever ink is active. -->
        <div v-if="t.tool === 'pen'" class="p-2">
          <!-- Its own provider: this popover's content is teleported out of the
               toolbar's, so without one the tooltips would match the bar's in
               looks but each wait out its own delay. -->
          <TooltipProvider>
            <div class="mb-2 flex gap-1">
              <Tooltip v-for="kind in DRAW_KINDS" :key="kind.key" :text="kind.label">
                <button
                  class="flex h-7 flex-1 items-center justify-center rounded-md"
                  :class="ui.state.drawKind === kind.key ? 'bg-surface-gray-3 text-ink-gray-9' : 'text-ink-gray-7 hover:bg-surface-gray-2'"
                  :aria-label="kind.label"
                  :aria-pressed="ui.state.drawKind === kind.key"
                  @click="ui.state.drawKind = kind.key"
                >
                  <span class="h-4 w-4" aria-hidden="true" :class="kind.icon" />
                </button>
              </Tooltip>
            </div>
          </TooltipProvider>

          <div class="mb-1 text-sm font-semibold text-ink-gray-5">Color</div>
          <!-- One ink per Espresso family, not the full grid (Vibhav, 17 Aug 2026).
               The grid's ten rows made this popover tall enough to cover the top of
               the canvas, and the popover opens WITH the tool — so a stroke drawn
               while it was open landed on the panel rather than the board. The
               values still come from the grid (INK_ROW), so this is the same
               palette in a smaller shape, not the near-miss second palette #495
               removed. There is no "None": ink with no colour draws nothing. -->
          <div class="mb-2 flex gap-1.5">
            <!-- frappe-ui-exempt: swatch renders a literal canvas colour -->
            <button
              v-for="ink in INK_ROW"
              :key="ink.hex"
              type="button"
              class="size-5 rounded border border-outline-gray-2"
              :class="ringedInk === ink.hex ? 'ring-2 ring-outline-gray-4' : ''"
              :style="{ background: ink.hex }"
              :aria-label="ink.name"
              @click="ui.state.penColor = ink.hex"
            />
          </div>

          <div class="mb-1 text-sm font-semibold text-ink-gray-5">Size</div>
          <div class="mb-2 flex gap-2">
            <!-- frappe-ui-exempt: swatch renders a literal size-preview dot --><button v-for="w in activeDrawWidths" :key="w" :aria-label="`Size ${w}`" :aria-pressed="ui.state[activeDrawWidthKey] === w" class="flex h-7 flex-1 items-center justify-center rounded-md" :class="ui.state[activeDrawWidthKey] === w ? 'bg-surface-gray-3' : 'bg-surface-gray-1 hover:bg-surface-gray-2'" @click="ui.state[activeDrawWidthKey] = w">
              <span class="rounded-full bg-surface-gray-10" :style="dotStyle(w, activeDrawWidths)" />
            </button>
          </div>

          <div class="mb-1 text-sm font-semibold text-ink-gray-5">Opacity</div>
          <Slider v-model="drawOpacityPercent" :min="10" :max="100" :step="5" size="sm" />
        </div>

        <!-- Eraser (#462): three menu rows, and the tip sizes swapped in place. -->
        <div v-else-if="t.tool === 'eraser'" class="w-52 p-1">
          <template v-if="!eraserSizesOpen">
            <!-- Eraser leads to the sizes; the chevron says so. Picking a size is
                 what arms ink mode, so this row opens rather than arms. -->
            <Button
              class="!w-full !justify-start"
              variant="ghost"
              theme="gray"
              :icon-left="ERASER_MODES[0].icon"
              :label="ERASER_MODES[0].label"
              @click="eraserSizesOpen = true"
            >
              {{ ERASER_MODES[0].label }}
              <template #suffix>
                <span class="lucide-chevron-right ml-auto size-4 text-ink-gray-5" aria-hidden="true" />
              </template>
            </Button>
            <Button
              class="!w-full !justify-start"
              variant="ghost"
              theme="gray"
              :icon-left="ERASER_MODES[1].icon"
              :label="ERASER_MODES[1].label"
              @click="armEraser('object')"
            >
              {{ ERASER_MODES[1].label }}
            </Button>
            <!-- Clear all is an ACTION, not a third mode: the other two arm a tool
                 and stay armed, this one fires once and is destructive. Separated
                 from them, and red. -->
            <div class="my-1 border-t border-outline-gray-1" />
            <Button
              class="!w-full !justify-start"
              variant="ghost"
              theme="red"
              icon-left="lucide-trash-2"
              label="Clear all"
              @click="confirmingClearAll = true"
            >
              Clear all
            </Button>
          </template>

          <template v-else>
            <Button
              class="!w-full !justify-start"
              variant="ghost"
              theme="gray"
              icon-left="lucide-chevron-left"
              label="Back to eraser modes"
              @click="eraserSizesOpen = false"
            >
              {{ ERASER_MODES[0].label }}
            </Button>
            <div class="my-1 border-t border-outline-gray-1" />
            <Button
              v-for="(size, index) in ERASER_SIZES"
              :key="size"
              class="!w-full !justify-start"
              variant="ghost"
              theme="gray"
              :icon-left="ERASER_SIZE_ICONS[index]"
              :label="ERASER_SIZE_LABELS[index]"
              :active="ui.state.eraserSize === size"
              @click="pickEraserSize(size)"
            >
              {{ ERASER_SIZE_LABELS[index] }}
            </Button>
          </template>
        </div>

        <!-- Sticky: color. -->
        <div v-else-if="t.tool === 'sticky'" class="w-48 p-2">
          <div class="mb-1 text-sm font-semibold text-ink-gray-5">Color</div>
          <div class="grid grid-cols-9 gap-1.5">
            <!-- frappe-ui-exempt: swatch paints a literal color Button cannot render --><button v-for="c in STICKY_COLORS" :key="c" :aria-label="`Sticky colour ${c}`" :aria-pressed="ui.state.stickyColor === c" class="h-5 w-5 rounded-sm border" :class="ui.state.stickyColor === c ? 'border-[1.5px] border-outline-gray-9' : 'border-outline-gray-2'" :style="{ background: c }" @click="ui.state.stickyColor = c" />
          </div>
        </div>

        <!-- Line: endpoints + color + width. -->
        <LineOptions
          v-else-if="t.tool === 'line'"
          :start="ui.state.lineStart"
          :end="ui.state.lineEnd"
          :color="ui.state.penColor"
          :width="ui.state.penWidth"
          @change="applyLineDefault"
        />
      </template>
    </Popover>

    <ToolbarButton
      v-else
      allows-blur
      :data-testid="'wtool-' + t.tool"
      :active="activeTool === t.tool"
      :icon="t.icon"
      :label="t.label"
      @click="editorUi.setTool(t.tool)"
    />
  </template>

  <!-- Insert image (action, not a tool). Hidden when the surrounding palette owns it. -->
  <ToolbarButton
    v-if="showImageInsert"
    allows-blur
    icon="lucide-image"
    label="Insert image"
    @click="imageInsert.pick((image) => editorUi.armStarter({ kind: 'image', image }))"
  />

  <!-- Clear all asks first (#462), the way the mind map's own clear-all does. It
       says what it will take, because "everything" on a unified canvas means the
       shapes and notes as well as the ink. -->
  <Dialog v-model:open="confirmingClearAll" title="Clear the canvas?">
    <template #default>
      <p class="text-base text-ink-gray-7">
        This removes everything on the canvas — drawings, notes, tables, shapes and
        connectors. You can undo it.
      </p>
    </template>
    <template #actions>
      <div class="flex justify-end gap-2">
        <Button @click="confirmingClearAll = false">Cancel</Button>
        <Button variant="solid" theme="red" @click="clearAll">Clear all</Button>
      </div>
    </template>
  </Dialog>
</template>
