<script setup>
// Transparency slider + readout (spec §4.3). The slider reads/writes shape.opacity
// (stored 0..1) as a 0..100% value and commits across the whole selection.
import { computed } from 'vue'
import { Slider } from 'frappe-ui'
import PaletteSection from './PaletteSection.vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'

const store = useDiagramStore()

const selectedIds = computed(() => store.selectedShapes.map((shape) => shape.id))
const reference = computed(() => store.selectedShapes[0])

// Opacity is the inverse of transparency; the readout shows opacity percent.
const opacityPercent = computed(() => Math.round((reference.value?.opacity ?? 1) * 100))

// frappe-ui's Slider models its value as an array — one entry for a single-value
// slider, two for a range — so bridge the store's single 0..1 opacity to [0..100].
const opacityModel = computed({
  get: () => [opacityPercent.value],
  set: ([value]) => setOpacity(value),
})

function setOpacity(value) {
  if (selectedIds.value.length) store.updateShapes(selectedIds.value, { opacity: Number(value) / 100 })
}
</script>

<template>
  <PaletteSection label="Transparency">
    <div class="flex items-center gap-2.5">
      <!-- No `label` prop: Slider renders it as a visible label above the track,
           which would duplicate the PaletteSection heading. -->
      <Slider v-model="opacityModel" :min="0" :max="100" class="flex-1" />
      <span class="w-9 text-right text-sm text-ink-gray-7">{{ opacityPercent }}%</span>
    </div>
  </PaletteSection>
</template>
