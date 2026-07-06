<script setup>
// Floating contextual toolbar for block diagrams — replaces the right palette.
// Hovers just above the current selection with the common edit actions; the
// heavier controls live in popovers (fill/border, text, arrange, link, opacity),
// each reusing the existing modification sections so all logic (incl. multi-
// select intersection) is shared. Mounted once per editor (EditorShell).
import { computed } from 'vue'
import { Popover, Tooltip, Select } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useCanvasToolbarStyle } from '@/composables/useCanvasToolbarStyle.js'
import { activeEditor, richCommands, isMarkActive } from '@/composables/useRichText.js'
import FillBorderSection from '@/components/palette-right/FillBorderSection.vue'
import ArrangeSection from '@/components/palette-right/ArrangeSection.vue'
import AlignSection from '@/components/palette-right/AlignSection.vue'
import DistributeSizeSection from '@/components/palette-right/DistributeSizeSection.vue'
import TransformSection from '@/components/palette-right/TransformSection.vue'
import LinkSection from '@/components/palette-right/LinkSection.vue'
import TransparencySection from '@/components/palette-right/TransparencySection.vue'
import ConnectorSection from '@/components/palette-right/ConnectorSection.vue'

const store = useDiagramStore()

const selection = computed(() => store.state.selection || [])
const shapes = computed(() => selection.value.map((id) => store.shapeById(id)).filter(Boolean))
const count = computed(() => selection.value.length)

// A lone selected connector gets its line controls instead of shape controls.
const connector = computed(() =>
  count.value === 1 ? store.connectorById(selection.value[0]) || null : null,
)
const hasShapes = computed(() => shapes.value.length > 0)
// Align + distribute act between shapes, so they only apply to a multi-selection.
const multi = computed(() => shapes.value.length >= 2)
const primaryFill = computed(() => shapes.value[0]?.fill || '#ffffff')
const primaryBorder = computed(() => shapes.value[0]?.border?.color || '#171717')

// Selection bounding box in canvas coords (shapes: x/y/w/h; connector: endpoints).
const box = computed(() => {
  if (hasShapes.value) {
    const xs = shapes.value.flatMap((s) => [s.x, s.x + s.w])
    const ys = shapes.value.flatMap((s) => [s.y, s.y + s.h])
    const x = Math.min(...xs), y = Math.min(...ys)
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
  }
  if (connector.value) {
    const pts = [connector.value.from, connector.value.to].filter(Boolean)
    if (!pts.length) return null
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
    const x = Math.min(...xs), y = Math.min(...ys)
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
  }
  return null
})

const style = useCanvasToolbarStyle(box)

function duplicate() {
  const ids = store.duplicate(selection.value)
  if (ids?.length) store.select(ids)
}
function remove() {
  store.removeSelectionOrIds(selection.value)
}

// ---- inline text formatting (surfaced directly on the bar for one-click edits).
// Drives the live rich-text editor when a text box is being edited, else the
// shape-level base style across the whole selection. Mirrors TextSection.
const FONTS = [
  { label: 'Inter', value: '' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono', value: 'ui-monospace, "SF Mono", Menlo, monospace' },
  { label: 'Rounded', value: '"Nunito", "Segoe UI", system-ui, sans-serif' },
  { label: 'Handwritten', value: "'Bradley Hand', 'Chalkboard SE', 'Comic Sans MS', 'Segoe Print', cursive" },
]
const editing = computed(() => Boolean(activeEditor.value))
const shapeIds = computed(() => shapes.value.map((s) => s.id))
const textRef = computed(() => shapes.value[0])
const textStyle = computed(() => textRef.value?.text?.style || {})
const textAlign = computed(() => textRef.value?.text?.align || 'center')
const font = computed(() => textStyle.value.font || '')
const fontSize = computed(() => textStyle.value.size ?? 16)
const autoFit = computed(() => Boolean(textRef.value?.text?.autoFit))
function updateTextStyle(patch) {
  if (shapeIds.value.length) store.updateShapes(shapeIds.value, { text: { style: patch } })
}
function markText(name) {
  if (editing.value) {
    if (name === 'bold') richCommands.toggleBold()
    else if (name === 'italic') richCommands.toggleItalic()
    else richCommands.toggleUnderline()
  } else updateTextStyle({ [name]: !textStyle.value[name] })
}
function markActive(name) {
  return editing.value ? isMarkActive(name) : Boolean(textStyle.value[name])
}
function setTextAlign(value) {
  if (editing.value) richCommands.setAlign(value)
  else if (shapeIds.value.length) store.updateShapes(shapeIds.value, { text: { align: value } })
}
function alignActive(value) {
  return editing.value ? isMarkActive(null, { textAlign: value }) : textAlign.value === value
}
function stepFontSize(delta) {
  const next = Math.max(6, Math.min(200, Number(fontSize.value) + delta))
  updateTextStyle({ size: next })
}
function setFont(value) {
  updateTextStyle({ font: value })
}
function toggleAutoFit() {
  if (shapeIds.value.length) store.updateShapes(shapeIds.value, { text: { autoFit: !autoFit.value } })
}

const btn = 'flex h-8 w-8 items-center justify-center rounded-md text-ink-gray-7 hover:bg-surface-gray-2'
const panel = 'max-h-[70vh] w-[300px] overflow-y-auto'
</script>

<template>
  <Teleport to="body">
    <div
      v-if="count && box"
      data-block-toolbar
      class="fixed z-30 flex max-w-[50vw] -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-lg border border-outline-gray-2 bg-surface-base p-1 shadow-lg"
      :style="style"
    >
      <!-- Connector selected: just its line controls. -->
      <template v-if="connector">
        <Popover side="top">
          <template #target="{ togglePopover }">
            <Tooltip text="Line">
              <button :class="btn" @mousedown.prevent @click="togglePopover()"><LucideIcon name="minus" class="h-4 w-4" /></button>
            </Tooltip>
          </template>
          <template #body-main><div :class="panel"><ConnectorSection :connector="connector" /></div></template>
        </Popover>
      </template>

      <!-- Shapes selected: fill+border+opacity, text, arrange, link. -->
      <template v-else-if="hasShapes">
        <!-- Fill and Border are separate menu items (each opens its own colour
             picker); opacity lives with Fill. -->
        <Popover side="top">
          <template #target="{ togglePopover }">
            <Tooltip text="Fill">
              <button :class="btn" @mousedown.prevent @click="togglePopover()">
                <span class="h-4 w-4 rounded-full border border-ink-gray-4" :style="{ background: primaryFill }" />
              </button>
            </Tooltip>
          </template>
          <template #body-main><div :class="panel"><FillBorderSection mode="fill" /><TransparencySection /></div></template>
        </Popover>

        <Popover side="top">
          <template #target="{ togglePopover }">
            <Tooltip text="Border">
              <button :class="btn" @mousedown.prevent @click="togglePopover()">
                <span class="h-4 w-4 rounded-full border-[3px] bg-surface-base" :style="{ borderColor: primaryBorder }" />
              </button>
            </Tooltip>
          </template>
          <template #body-main><div :class="panel"><FillBorderSection mode="border" /></div></template>
        </Popover>

        <div class="mx-0.5 h-5 w-px bg-surface-gray-3" />

        <!-- Text formatting surfaced directly on the bar (one-click, real-time):
             font, size, bold/italic/underline, align. -->
        <Select :model-value="font" :options="FONTS" class="h-8 w-[92px]" @update:model-value="setFont" @mousedown.stop />
        <div class="flex items-center rounded-md border border-outline-gray-2">
          <button class="flex h-8 w-6 items-center justify-center text-ink-gray-6 hover:bg-surface-gray-2" @mousedown.prevent @click="stepFontSize(-1)"><LucideIcon name="minus" class="h-3.5 w-3.5" /></button>
          <span class="w-6 text-center text-[12px] tabular-nums text-ink-gray-8">{{ fontSize }}</span>
          <button class="flex h-8 w-6 items-center justify-center text-ink-gray-6 hover:bg-surface-gray-2" @mousedown.prevent @click="stepFontSize(1)"><LucideIcon name="plus" class="h-3.5 w-3.5" /></button>
        </div>
        <Tooltip text="Bold"><button :class="[btn, markActive('bold') && 'bg-surface-gray-3 text-ink-gray-9']" @mousedown.prevent @click="markText('bold')"><LucideIcon name="bold" class="h-4 w-4" /></button></Tooltip>
        <Tooltip text="Italic"><button :class="[btn, markActive('italic') && 'bg-surface-gray-3 text-ink-gray-9']" @mousedown.prevent @click="markText('italic')"><LucideIcon name="italic" class="h-4 w-4" /></button></Tooltip>
        <Tooltip text="Underline"><button :class="[btn, markActive('underline') && 'bg-surface-gray-3 text-ink-gray-9']" @mousedown.prevent @click="markText('underline')"><LucideIcon name="underline" class="h-4 w-4" /></button></Tooltip>
        <Tooltip text="Align left"><button :class="[btn, alignActive('left') && 'bg-surface-gray-3 text-ink-gray-9']" @mousedown.prevent @click="setTextAlign('left')"><LucideIcon name="text-align-start" class="h-4 w-4" /></button></Tooltip>
        <Tooltip text="Align center"><button :class="[btn, alignActive('center') && 'bg-surface-gray-3 text-ink-gray-9']" @mousedown.prevent @click="setTextAlign('center')"><LucideIcon name="text-align-center" class="h-4 w-4" /></button></Tooltip>
        <Tooltip text="Align right"><button :class="[btn, alignActive('right') && 'bg-surface-gray-3 text-ink-gray-9']" @mousedown.prevent @click="setTextAlign('right')"><LucideIcon name="text-align-end" class="h-4 w-4" /></button></Tooltip>
        <Tooltip text="Auto-fit text to shape"><button :class="[btn, autoFit && 'bg-surface-gray-3 text-ink-gray-9']" @mousedown.prevent @click="toggleAutoFit"><LucideIcon name="scaling" class="h-4 w-4" /></button></Tooltip>

        <div class="mx-0.5 h-5 w-px bg-surface-gray-3" />

        <!-- Arrange / Align / Distribute / Transform are separate menu items, not
             one crammed leaf; each opens just its own section. -->
        <Popover side="top">
          <template #target="{ togglePopover }">
            <Tooltip text="Arrange">
              <button :class="btn" @mousedown.prevent @click="togglePopover()"><LucideIcon name="layers" class="h-4 w-4" /></button>
            </Tooltip>
          </template>
          <template #body-main><div :class="panel"><ArrangeSection /></div></template>
        </Popover>

        <!-- Align & distribute act between shapes — only for a multi-selection,
             so a lone shape doesn't open an empty menu. -->
        <Popover v-if="multi" side="top">
          <template #target="{ togglePopover }">
            <Tooltip text="Align">
              <button :class="btn" @mousedown.prevent @click="togglePopover()"><LucideIcon name="align-center-horizontal" class="h-4 w-4" /></button>
            </Tooltip>
          </template>
          <template #body-main><div :class="panel"><AlignSection /></div></template>
        </Popover>

        <Popover v-if="multi" side="top">
          <template #target="{ togglePopover }">
            <Tooltip text="Distribute & size">
              <button :class="btn" @mousedown.prevent @click="togglePopover()"><LucideIcon name="columns-2" class="h-4 w-4" /></button>
            </Tooltip>
          </template>
          <template #body-main><div :class="panel"><DistributeSizeSection /></div></template>
        </Popover>

        <Popover side="top">
          <template #target="{ togglePopover }">
            <Tooltip text="Transform">
              <button :class="btn" @mousedown.prevent @click="togglePopover()"><LucideIcon name="flip-horizontal-2" class="h-4 w-4" /></button>
            </Tooltip>
          </template>
          <template #body-main><div :class="panel"><TransformSection /></div></template>
        </Popover>

        <Popover side="top">
          <template #target="{ togglePopover }">
            <Tooltip text="Link">
              <button :class="btn" @mousedown.prevent @click="togglePopover()"><LucideIcon name="link" class="h-4 w-4" /></button>
            </Tooltip>
          </template>
          <template #body-main>
            <div :class="panel">
              <LinkSection />
            </div>
          </template>
        </Popover>

        <div class="mx-0.5 h-5 w-px bg-surface-gray-3" />

        <Tooltip text="Duplicate">
          <button :class="btn" @mousedown.prevent @click="duplicate"><LucideIcon name="copy" class="h-4 w-4" /></button>
        </Tooltip>
      </template>

      <Tooltip text="Delete">
        <button class="flex h-8 w-8 items-center justify-center rounded-md text-red-600 hover:bg-red-50" @mousedown.prevent @click="remove">
          <LucideIcon name="trash-2" class="h-4 w-4" />
        </button>
      </Tooltip>
    </div>
  </Teleport>
</template>
