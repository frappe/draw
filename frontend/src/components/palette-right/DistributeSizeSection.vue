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
    <div class="grid grid-cols-4 gap-1.5">
      <!-- Distribute draws evenly spaced boxes rather than table columns (#472). -->
      <ActionTile v-if="canDistribute" icon="lucide-align-horizontal-distribute-center" label="Dist. H" @click="dist.distributeHorizontal()" />
      <ActionTile v-if="canDistribute" icon="lucide-align-vertical-distribute-center" label="Dist. V" @click="dist.distributeVertical()" />
      <ActionTile v-if="canDistribute" icon="lucide-minimize-2" label="Remove gaps" @click="dist.removeGaps()" />
      <!-- Width, Height and Same size were three near-identical arrow glyphs for
           three different operations, which no label was left to tell apart. Width
           and Height are deliberately a pair now; Same size is not one of them. -->
      <ActionTile icon="lucide-unfold-horizontal" label="Width" @click="dist.matchWidth()" />
      <ActionTile icon="lucide-unfold-vertical" label="Height" @click="dist.matchHeight()" />
      <ActionTile icon="lucide-proportions" label="Same size" @click="dist.matchSize()" />
      <!-- `lucide-grid-2x2` is the icon Guides wore until #458 moved it off, and it
           still stands for mind-map layout in MapLayoutGroup. -->
      <ActionTile icon="lucide-layout-grid" label="Grid" @click="dist.arrangeGrid()" />
      <ActionTile v-if="canSwap" icon="lucide-repeat" label="Swap" @click="dist.swapPositions()" />
    </div>
  </PaletteSection>
</template>
