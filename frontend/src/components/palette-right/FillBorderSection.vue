<script setup>
// Fill & border controls (spec §4.3, README 4d). Continuous colour pickers set
// fill / border colour across the whole selection; a compact weight + dash row
// updates the border. Field text/heights match the rest of the palette.
import { computed } from 'vue'
import PaletteSection from './PaletteSection.vue'
import ColorPicker from './ColorPicker.vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'

const store = useDiagramStore()

const dashStyles = ['solid', 'dashed', 'dotted']

// Selected shape ids (fill/border apply to all of them at once, §4.3).
const selectedIds = computed(() => store.selectedShapes.map((shape) => shape.id))

// Reference shape drives the field readouts (first in selection).
const reference = computed(() => store.selectedShapes[0])
const fill = computed(() => colorOr(reference.value?.fill, '#FFFFFF'))
const borderColor = computed(() => colorOr(reference.value?.border?.color, '#171717'))
const weight = computed(() => reference.value?.border?.width ?? 1.5)
const dash = computed(() => reference.value?.border?.dash ?? 'solid')

// A concrete colour for the picker (shapes may store 'none' or be unset).
function colorOr(value, fallback) {
  return value && value !== 'none' ? value : fallback
}

function setFill(color) {
  if (selectedIds.value.length) store.updateShapes(selectedIds.value, { fill: color })
}

function setBorderColor(color) {
  if (selectedIds.value.length) store.updateShapes(selectedIds.value, { border: { color } })
}

function setWeight(value) {
  const width = Number(value)
  if (selectedIds.value.length && width >= 0) store.updateShapes(selectedIds.value, { border: { width } })
}

function setDash(value) {
  if (selectedIds.value.length) store.updateShapes(selectedIds.value, { border: { dash: value } })
}
</script>

<template>
  <PaletteSection label="Fill & border">
    <div class="space-y-2">
      <ColorPicker label="Fill" :model-value="fill" @update:model-value="setFill" />
      <ColorPicker label="Border" :model-value="borderColor" @update:model-value="setBorderColor" />
    </div>

    <div class="mt-2.5 flex gap-1.5">
      <label class="flex h-8 flex-1 items-center gap-1 rounded-md border border-outline-gray-2 px-2">
        <input
          type="number"
          min="0"
          step="0.5"
          :value="weight"
          class="w-full bg-transparent text-xs leading-none text-ink-gray-7 outline-none"
          @change="setWeight($event.target.value)"
        />
        <span class="text-[11px] text-ink-gray-5">px</span>
      </label>
      <select
        class="h-8 flex-1 rounded-md border border-outline-gray-2 bg-surface-white px-2 text-xs capitalize text-ink-gray-7 outline-none"
        :value="dash"
        @change="setDash($event.target.value)"
      >
        <option v-for="style in dashStyles" :key="style" :value="style" class="capitalize">
          {{ style }}
        </option>
      </select>
    </div>
  </PaletteSection>
</template>
