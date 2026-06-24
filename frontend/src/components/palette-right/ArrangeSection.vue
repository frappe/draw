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
    <div class="grid grid-cols-3 gap-1.5">
      <ActionTile icon="chevrons-up" label="To front" @click="store.bringToFront(shapeIds)" />
      <ActionTile icon="chevron-up" label="Forward" @click="store.bringForward(shapeIds)" />
      <ActionTile icon="chevron-down" label="Backward" @click="store.sendBackward(shapeIds)" />
      <ActionTile icon="chevrons-down" label="To back" @click="store.sendToBack(shapeIds)" />
      <ActionTile v-if="canGroup" icon="group" label="Group" @click="store.group(shapeIds)" />
      <ActionTile v-if="canUngroup" icon="ungroup" label="Ungroup" @click="store.ungroup(shapeIds)" />
    </div>
  </PaletteSection>
</template>
