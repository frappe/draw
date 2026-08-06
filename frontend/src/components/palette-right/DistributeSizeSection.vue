<script setup>
// Distribute & same-size (spec §4.3). Distribute H/V and Remove gaps need 3+
// shapes; Width/Height/Same size match the last-selected reference and need 2+.
// Tiles hide when their requirement isn't met (intersection rule).
import { computed } from 'vue'
import PaletteSection from './PaletteSection.vue'
import ActionTile from './ActionTile.vue'
import { useDistribute } from '@/composables/useDistribute.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'

const store = useDiagramStore()
const dist = useDistribute(store)

const count = computed(() => store.selectedShapes.length)
const canDistribute = computed(() => count.value >= 3)
const canMatch = computed(() => count.value >= 2)
const canSwap = computed(() => count.value === 2)
const visible = computed(() => canMatch.value)
</script>

<template>
  <PaletteSection v-if="visible" label="Distribute & size">
    <div class="grid grid-cols-2 gap-1.5">
      <ActionTile v-if="canDistribute" icon="lucide-columns-2" label="Dist. H" @click="dist.distributeHorizontal()" />
      <ActionTile v-if="canDistribute" icon="lucide-rows-2" label="Dist. V" @click="dist.distributeVertical()" />
      <ActionTile v-if="canDistribute" icon="lucide-minimize-2" label="Remove gaps" @click="dist.removeGaps()" />
      <ActionTile icon="lucide-move-horizontal" label="Width" @click="dist.matchWidth()" />
      <ActionTile icon="lucide-move-vertical" label="Height" @click="dist.matchHeight()" />
      <ActionTile icon="lucide-maximize" label="Same size" @click="dist.matchSize()" />
      <ActionTile icon="lucide-grid-2x2" label="Grid" @click="dist.arrangeGrid()" />
      <ActionTile v-if="canSwap" icon="lucide-repeat" label="Swap" @click="dist.swapPositions()" />
    </div>
  </PaletteSection>
</template>
