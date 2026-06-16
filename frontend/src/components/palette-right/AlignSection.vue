<script setup>
// Align: left/center/right, top/middle/bottom (spec §4.3). Aligns relative to
// the last-selected shape, or to the canvas when the "to canvas" toggle is on.
// Hidden unless aligning is meaningful (2+ shapes, or 1+ with align-to-canvas).
import { computed, ref } from 'vue'
import PaletteSection from './PaletteSection.vue'
import ActionTile from './ActionTile.vue'
import { useAlignment } from '@/composables/useAlignment.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'

const store = useDiagramStore()
const align = useAlignment(store)
const toCanvas = ref(false)

const shapeCount = computed(() => store.selectedShapes.value.length)
const visible = computed(() => (toCanvas.value ? shapeCount.value >= 1 : shapeCount.value >= 2))
</script>

<template>
  <PaletteSection v-if="shapeCount >= 1" label="Align">
    <label class="mb-2 flex items-center gap-1.5 text-[11px] text-ink-gray-6">
      <input v-model="toCanvas" type="checkbox" class="h-3 w-3" />
      Align to canvas
    </label>
    <div v-if="visible" class="grid grid-cols-6 gap-1.5">
      <ActionTile icon="align-left" label="Left" @click="align.alignLeft(toCanvas)" />
      <ActionTile icon="align-center" label="Center" @click="align.alignCenter(toCanvas)" />
      <ActionTile icon="align-right" label="Right" @click="align.alignRight(toCanvas)" />
      <ActionTile icon="arrow-up" label="Top" @click="align.alignTop(toCanvas)" />
      <ActionTile icon="minus" label="Middle" @click="align.alignMiddle(toCanvas)" />
      <ActionTile icon="arrow-down" label="Bottom" @click="align.alignBottom(toCanvas)" />
    </div>
  </PaletteSection>
</template>
