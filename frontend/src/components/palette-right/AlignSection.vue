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
    <div class="grid grid-cols-4 gap-1.5">
      <!-- Lucide's OBJECT alignment set, not its text-alignment set (#472). These
           draw boxes against a rule, which is what the control does; the text
           icons drew lines of type, and TextGroup uses those same three for real
           text alignment. "Middle" was `lucide-minus`, a bare dash that said
           nothing at all and collided with the toolbar's Lines control. -->
      <ActionTile icon="lucide-align-start-vertical" label="Left" @click="align.alignLeft()" />
      <ActionTile icon="lucide-align-center-vertical" label="Center" @click="align.alignCenter()" />
      <ActionTile icon="lucide-align-end-vertical" label="Right" @click="align.alignRight()" />
      <ActionTile icon="lucide-align-start-horizontal" label="Top" @click="align.alignTop()" />
      <ActionTile icon="lucide-align-center-horizontal" label="Middle" @click="align.alignMiddle()" />
      <ActionTile icon="lucide-align-end-horizontal" label="Bottom" @click="align.alignBottom()" />
    </div>
  </PaletteSection>
</template>
