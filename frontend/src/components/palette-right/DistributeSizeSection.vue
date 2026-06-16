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

const count = computed(() => store.selectedShapes.value.length)
const canDistribute = computed(() => count.value >= 3)
const canMatch = computed(() => count.value >= 2)
const visible = computed(() => canMatch.value)
</script>

<template>
  <PaletteSection v-if="visible" label="Distribute & size">
    <div class="grid grid-cols-3 gap-1.5">
      <ActionTile v-if="canDistribute" icon="columns" label="Dist. H" @click="dist.distributeHorizontal()" />
      <ActionTile v-if="canDistribute" icon="rows" label="Dist. V" @click="dist.distributeVertical()" />
      <ActionTile v-if="canDistribute" icon="minimize-2" label="Remove gaps" @click="dist.removeGaps()" />
      <ActionTile icon="move-horizontal" label="Width" @click="dist.matchWidth()" />
      <ActionTile icon="move-vertical" label="Height" @click="dist.matchHeight()" />
      <ActionTile icon="maximize" label="Same size" @click="dist.matchSize()" />
    </div>
  </PaletteSection>
</template>
