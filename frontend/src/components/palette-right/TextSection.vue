<script setup>
// Text/font controls (spec §6, README 4d). Inter is the only font in v1; size +
// bold/italic/underline + horizontal alignment commit to shape.text.style and
// shape.text.align across the whole selection at once (§4.3 multi-select rule).
import { computed } from 'vue'
import PaletteSection from './PaletteSection.vue'
import ActionTile from './ActionTile.vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'

const store = useDiagramStore()

const selectedIds = computed(() => store.selectedShapes.map((shape) => shape.id))
const reference = computed(() => store.selectedShapes[0])
const style = computed(() => reference.value?.text?.style || {})
const align = computed(() => reference.value?.text?.align || 'center')

function setSize(value) {
  const size = Number(value)
  if (selectedIds.value.length && size > 0) updateStyle({ size })
}

function toggleMark(mark) {
  if (selectedIds.value.length) updateStyle({ [mark]: !style.value[mark] })
}

function setAlign(value) {
  if (selectedIds.value.length) store.updateShapes(selectedIds.value, { text: { align: value } })
}

function updateStyle(patch) {
  store.updateShapes(selectedIds.value, { text: { style: patch } })
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
      <ActionTile icon="bold" label="Bold" :active="!!style.bold" @click="toggleMark('bold')" />
      <ActionTile icon="italic" label="Italic" :active="!!style.italic" @click="toggleMark('italic')" />
      <ActionTile icon="underline" label="Under" :active="!!style.underline" @click="toggleMark('underline')" />
      <ActionTile icon="align-left" label="Left" :active="align === 'left'" @click="setAlign('left')" />
      <ActionTile icon="align-center" label="Center" :active="align === 'center'" @click="setAlign('center')" />
      <ActionTile icon="align-right" label="Right" :active="align === 'right'" @click="setAlign('right')" />
    </div>
  </PaletteSection>
</template>
