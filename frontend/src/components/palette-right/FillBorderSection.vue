<script setup>
// Fill & border controls (spec §4.3, README 4d). Continuous colour pickers set
// fill / border colour across the whole selection; a compact weight + dash row
// updates the border. Field text/heights match the rest of the palette.
import { computed } from 'vue'
import PaletteSection from './PaletteSection.vue'
import ColorPicker from './ColorPicker.vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'

const store = useDiagramStore()

// Which channel(s) to render: 'fill' (quick styles + fill), 'border' (border
// colour + width + dash), or 'both'. Lets the block context menu surface Fill
// and Border as separate items.
const props = defineProps({
  mode: { type: String, default: 'both', validator: (v) => ['both', 'fill', 'border'].includes(v) },
})
const showFill = computed(() => props.mode !== 'border')
const showBorder = computed(() => props.mode !== 'fill')
const sectionLabel = computed(() => ({ fill: 'Fill', border: 'Border' })[props.mode] || 'Fill & border')

// Border styles shown VISUALLY (a line preview), not as text (D4).
const dashStyles = ['solid', 'dashed', 'dotted']
const DASH_ARRAY = { solid: '0', dashed: '5 3', dotted: '1.5 3' }

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
// Neutral tones first (matching the default palette), then a few soft accents.
const QUICK_STYLES = [
  { fill: '#FFFFFF', border: '#C7C7C7' },
  { fill: '#F3F3F3', border: '#7C7C7C' },
  { fill: 'none', border: '#171717' },
  { fill: '#171717', border: '#171717' },
  { fill: '#EFF6FF', border: '#8FBEF5' },
  { fill: '#F4FFF6', border: '#88D5A5' },
  { fill: '#FDFAED', border: '#EBC968' },
]
function applyQuickStyle(preset) {
  if (!selectedIds.value.length) return
  store.updateShapes(selectedIds.value, { fill: preset.fill, border: { color: preset.border, width: 1.5 } })
}
</script>

<template>
  <PaletteSection :label="sectionLabel">
    <div v-if="showFill" class="mb-2.5 flex gap-1.5">
      <button
        v-for="(preset, i) in QUICK_STYLES"
        :key="i"
        class="h-6 w-6 flex-none rounded-md border-2"
        :style="{ background: preset.fill === 'none' ? '#FFFFFF' : preset.fill, borderColor: preset.border }"
        :title="'Quick style'"
        :aria-label="`Quick style ${i + 1}`"
        @click="applyQuickStyle(preset)"
      />
    </div>
    <div class="space-y-2">
      <ColorPicker v-if="showFill" inline label="Fill" :model-value="fill" @update:model-value="setFill" />
      <ColorPicker v-if="showBorder" inline label="Border" :model-value="borderColor" @update:model-value="setBorderColor" />
    </div>

    <div v-if="showBorder" class="mt-2.5 flex gap-1.5">
      <label class="flex h-8 flex-1 items-center gap-1 rounded-md border border-outline-gray-2 px-2">
        <input
          type="number"
          min="0"
          step="0.1"
          :value="weight"
          class="w-full bg-transparent text-xs leading-none text-ink-gray-7 outline-none"
          @change="setWeight($event.target.value)"
        />
        <span class="text-[11px] text-ink-gray-5">px</span>
      </label>
      <div class="flex flex-1 gap-1">
        <button
          v-for="style in dashStyles"
          :key="style"
          class="flex h-8 flex-1 items-center justify-center rounded-md border"
          :class="dash === style ? 'border-ink-gray-9 bg-surface-gray-2' : 'border-outline-gray-2 hover:bg-surface-gray-1'"
          :title="style"
          :aria-label="style"
          @click="setDash(style)"
        >
          <svg width="30" height="8" viewBox="0 0 30 8">
            <line x1="2" y1="4" x2="28" y2="4" stroke="currentColor" class="text-ink-gray-8" stroke-width="2" stroke-linecap="round" :stroke-dasharray="DASH_ARRAY[style]" />
          </svg>
        </button>
      </div>
    </div>
  </PaletteSection>
</template>
