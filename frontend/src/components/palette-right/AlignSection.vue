<script setup>
// Align: left/center/right, top/middle/bottom (spec §4.3). Aligns relative to
// the last-selected shape. Only shown for a multi-selection (2+ shapes).
import { computed } from 'vue'
import PaletteSection from './PaletteSection.vue'
import ActionTile from './ActionTile.vue'
import { useAlignment } from '@/composables/useAlignment.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'

const store = useDiagramStore()
const align = useAlignment(store)

const shapeCount = computed(() => store.selectedShapes.length)
</script>

<template>
  <PaletteSection v-if="shapeCount >= 2" label="Align">
    <div class="grid grid-cols-2 gap-1.5">
      <ActionTile icon="lucide-text-align-start" label="Left" @click="align.alignLeft()" />
      <ActionTile icon="lucide-text-align-center" label="Center" @click="align.alignCenter()" />
      <ActionTile icon="lucide-text-align-end" label="Right" @click="align.alignRight()" />
      <ActionTile icon="lucide-arrow-up" label="Top" @click="align.alignTop()" />
      <ActionTile icon="lucide-minus" label="Middle" @click="align.alignMiddle()" />
      <ActionTile icon="lucide-arrow-down" label="Bottom" @click="align.alignBottom()" />
    </div>
  </PaletteSection>
</template>
