<script setup>
// Text/font controls (spec §6). While a text editor is active, the buttons drive
// the TipTap selection live (bold/italic/underline/lists/align) — they use
// mousedown.prevent so they don't steal focus from the editor. When nothing is
// being edited, they set the shape-level base style across the selection (§4.3).
import { computed } from 'vue'
import { Select } from 'frappe-ui'
import PaletteSection from './PaletteSection.vue'
import ActionTile from './ActionTile.vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { activeEditor, richCommands, isMarkActive } from '@/composables/useRichText.js'

const store = useDiagramStore()

// Curated font stacks (no web fonts — each is a safe system stack, matching the
// app's no-webfont approach). '' means the default Inter family (spec 6.2).
const FONTS = [
  { label: 'Inter (sans)', value: '' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono', value: 'ui-monospace, "SF Mono", Menlo, monospace' },
  { label: 'Rounded', value: '"Nunito", "Segoe UI", system-ui, sans-serif' },
  { label: 'Handwritten', value: "'Bradley Hand', 'Chalkboard SE', 'Comic Sans MS', 'Segoe Print', cursive" },
]

const editing = computed(() => Boolean(activeEditor.value))
const selectedIds = computed(() => store.selectedShapes.map((shape) => shape.id))
const reference = computed(() => store.selectedShapes[0])
const style = computed(() => reference.value?.text?.style || {})
const align = computed(() => reference.value?.text?.align || 'center')
const font = computed(() => style.value.font || '')
const autoFit = computed(() => Boolean(reference.value?.text?.autoFit))

function setSize(value) {
  const size = Number(value)
  if (selectedIds.value.length && size > 0) updateStyle({ size })
}
function setFont(value) {
  if (selectedIds.value.length) updateStyle({ font: value })
}
function toggleAutoFit() {
  if (selectedIds.value.length) store.updateShapes(selectedIds.value, { text: { autoFit: !autoFit.value } })
}
function updateStyle(patch) {
  store.updateShapes(selectedIds.value, { text: { style: patch } })
}

// Bold/italic/underline: drive the editor when editing, else the shape style.
function mark(name) {
  if (editing.value) {
    if (name === 'bold') richCommands.toggleBold()
    else if (name === 'italic') richCommands.toggleItalic()
    else richCommands.toggleUnderline()
  } else if (selectedIds.value.length) {
    updateStyle({ [name]: !style.value[name] })
  }
}
function setAlign(value) {
  if (editing.value) richCommands.setAlign(value)
  else if (selectedIds.value.length) store.updateShapes(selectedIds.value, { text: { align: value } })
}

function markActive(name) {
  return editing.value ? isMarkActive(name) : Boolean(style.value[name])
}
function alignActive(value) {
  return editing.value ? isMarkActive(null, { textAlign: value }) : align.value === value
}
</script>

<template>
  <PaletteSection label="Text">
    <div class="mb-2 flex gap-1.5">
      <Select
        class="flex-[2]"
        :model-value="font"
        :options="FONTS"
        @update:model-value="setFont"
      />
      <label class="flex h-8 flex-1 items-center rounded-md border border-outline-gray-2 px-2">
        <input
          type="number"
          min="1"
          :value="style.size ?? 16"
          class="w-full bg-transparent text-xs leading-none text-ink-gray-7 outline-none"
          @change="setSize($event.target.value)"
        />
      </label>
    </div>
    <div class="grid grid-cols-6 gap-1.5">
      <ActionTile icon="bold" label="Bold" :active="markActive('bold')" @mousedown.prevent @click="mark('bold')" />
      <ActionTile icon="italic" label="Italic" :active="markActive('italic')" @mousedown.prevent @click="mark('italic')" />
      <ActionTile icon="underline" label="Under" :active="markActive('underline')" @mousedown.prevent @click="mark('underline')" />
      <ActionTile icon="align-left" label="Left" :active="alignActive('left')" @mousedown.prevent @click="setAlign('left')" />
      <ActionTile icon="align-center" label="Center" :active="alignActive('center')" @mousedown.prevent @click="setAlign('center')" />
      <ActionTile icon="align-right" label="Right" :active="alignActive('right')" @mousedown.prevent @click="setAlign('right')" />
    </div>
    <!-- Lists are rich-text only, so show them while editing. -->
    <div v-if="editing" class="mt-1.5 grid grid-cols-6 gap-1.5">
      <ActionTile icon="list" label="Bullets" @mousedown.prevent @click="richCommands.toggleBulletList()" />
      <ActionTile icon="hash" label="Numbered" @mousedown.prevent @click="richCommands.toggleOrderedList()" />
    </div>

    <!-- Auto-fit shrinks the text to stay inside the shape (spec 6.4). -->
    <button
      class="mt-2 flex w-full items-center justify-between rounded-md border px-2.5 py-1.5 text-[12px]"
      :class="autoFit ? 'border-ink-gray-9 bg-surface-gray-2 text-ink-gray-9' : 'border-outline-gray-2 text-ink-gray-6 hover:bg-surface-gray-1'"
      :aria-pressed="autoFit"
      @click="toggleAutoFit"
    >
      <span>Auto-fit text to shape</span>
      <span class="text-[11px]">{{ autoFit ? 'On' : 'Off' }}</span>
    </button>
  </PaletteSection>
</template>
