<script setup>
// Transparency slider + readout (spec §4.3). The slider reads/writes shape.opacity
// (stored 0..1) as a 0..100% value and commits across the whole selection.
import { computed } from 'vue'
import PaletteSection from './PaletteSection.vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'

const store = useDiagramStore()

const selectedIds = computed(() => store.selectedShapes.map((shape) => shape.id))
const reference = computed(() => store.selectedShapes[0])

// Opacity is the inverse of transparency; the readout shows opacity percent.
const opacityPercent = computed(() => Math.round((reference.value?.opacity ?? 1) * 100))

function setOpacity(value) {
  if (selectedIds.value.length) store.updateShapes(selectedIds.value, { opacity: Number(value) / 100 })
}
</script>

<template>
  <PaletteSection label="Transparency">
    <div class="flex items-center gap-2.5">
      <input
        type="range"
        min="0"
        max="100"
        :value="opacityPercent"
        class="flex-1"
        @input="setOpacity($event.target.value)"
      />
      <span class="w-9 text-right text-xs text-ink-gray-7">{{ opacityPercent }}%</span>
    </div>
  </PaletteSection>
</template>
