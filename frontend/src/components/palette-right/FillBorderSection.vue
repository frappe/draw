<script setup>
// Fill & border controls (spec §4.3, README 4d). Continuous colour pickers set
// fill / border colour across the whole selection; a compact weight + dash row
// updates the border. Field text/heights match the rest of the palette.
import { computed } from 'vue'
import { Select } from 'frappe-ui'
import PaletteSection from './PaletteSection.vue'
import ColorPicker from './ColorPicker.vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'

const store = useDiagramStore()

const dashStyles = ['solid', 'dashed', 'dotted']
const dashOptions = dashStyles.map((style) => ({ label: style[0].toUpperCase() + style.slice(1), value: style }))

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

// One-click quick styles: a curated fill+border combo applied to the whole
// selection (spec 8.4). Swatch shows the fill; the ring shows the border.
const QUICK_STYLES = [
  { fill: '#EFF6FF', border: '#4F94FF' },
  { fill: '#F4FFF6', border: '#88D5A5' },
  { fill: '#FDFAED', border: '#FBCC55' },
  { fill: '#FCEAF5', border: '#E68AC4' },
  { fill: '#F3F3F3', border: '#7C7C7C' },
  { fill: 'none', border: '#171717' },
  { fill: '#1F2933', border: '#1F2933' },
]
function applyQuickStyle(preset) {
  if (!selectedIds.value.length) return
  store.updateShapes(selectedIds.value, { fill: preset.fill, border: { color: preset.border, width: 1.5 } })
}
</script>

<template>
  <PaletteSection label="Fill & border">
    <div class="mb-2.5 flex gap-1.5">
      <button
        v-for="(preset, i) in QUICK_STYLES"
        :key="i"
        class="h-6 w-6 flex-none rounded-md border-2"
        :style="{ background: preset.fill === 'none' ? '#FFFFFF' : preset.fill, borderColor: preset.border }"
        :title="'Quick style'"
        @click="applyQuickStyle(preset)"
      />
    </div>
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
      <Select class="flex-1" :model-value="dash" :options="dashOptions" @update:model-value="setDash" />
    </div>
  </PaletteSection>
</template>
