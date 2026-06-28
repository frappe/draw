<script setup>
// Text/font controls (spec §6). While a text editor is active, the buttons drive
// the TipTap selection live (bold/italic/underline/lists/align) — they use
// mousedown.prevent so they don't steal focus from the editor. When nothing is
// being edited, they set the shape-level base style across the selection (§4.3).
import { computed } from 'vue'
import PaletteSection from './PaletteSection.vue'
import ActionTile from './ActionTile.vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { activeEditor, richCommands, isMarkActive } from '@/composables/useRichText.js'

const store = useDiagramStore()

const editing = computed(() => Boolean(activeEditor.value))
const selectedIds = computed(() => store.selectedShapes.map((shape) => shape.id))
const reference = computed(() => store.selectedShapes[0])
const style = computed(() => reference.value?.text?.style || {})
const align = computed(() => reference.value?.text?.align || 'center')

function setSize(value) {
  const size = Number(value)
  if (selectedIds.value.length && size > 0) updateStyle({ size })
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
      <div class="flex h-8 flex-[2] items-center rounded-md border border-outline-gray-2 px-2 text-xs text-ink-gray-7">
        Inter
      </div>
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
  </PaletteSection>
</template>
