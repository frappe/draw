<script setup>
// Arrange: z-order + group/ungroup (spec §4.3). Wired directly to the store's
// ordering and grouping methods, operating on the selected shapes. Group needs
// 2+ shapes; Ungroup appears only when a grouped shape is selected (intersection
// rule, spec §4.3).
import { computed } from 'vue'
import PaletteSection from './PaletteSection.vue'
import ActionTile from './ActionTile.vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'

const store = useDiagramStore()
const shapes = computed(() => store.selectedShapes)
const shapeIds = computed(() => shapes.value.map((shape) => shape.id))

const hasShapes = computed(() => shapes.value.length > 0)
const canGroup = computed(() => shapes.value.length > 1)
const canUngroup = computed(() => shapes.value.some((shape) => shape.groupId))
</script>

<template>
  <PaletteSection v-if="hasShapes" label="Arrange">
    <!-- Two per row (#267), which is also what the now-visible 14px tile labels
         need — "Backward" / "To front" would truncate in a 3-column tile. -->
    <div class="grid grid-cols-2 gap-1.5">
      <ActionTile icon="lucide-chevrons-up" label="To front" @click="store.bringToFront(shapeIds)" />
      <ActionTile icon="lucide-chevron-up" label="Forward" @click="store.bringForward(shapeIds)" />
      <ActionTile icon="lucide-chevron-down" label="Backward" @click="store.sendBackward(shapeIds)" />
      <ActionTile icon="lucide-chevrons-down" label="To back" @click="store.sendToBack(shapeIds)" />
      <ActionTile v-if="canGroup" icon="lucide-group" label="Group" @click="store.group(shapeIds)" />
      <ActionTile v-if="canUngroup" icon="lucide-ungroup" label="Ungroup" @click="store.ungroup(shapeIds)" />
    </div>
  </PaletteSection>
</template>
