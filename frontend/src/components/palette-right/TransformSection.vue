<script setup>
// Transform: flip H/V (spec §4.3). Rotation is on-canvas via the selection
// rotation handle; Swap lives in Distribute & size. Each multi-step move is
// wrapped in store.commit so it is a single undo step.
import { computed } from 'vue'
import PaletteSection from './PaletteSection.vue'
import ActionTile from './ActionTile.vue'
import { axisAlignedBBox } from '@/diagram/geometry.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'

const store = useDiagramStore()

const shapes = computed(() => store.selectedShapes)
const hasShapes = computed(() => shapes.value.length > 0)

// Mirror the selection across the axis at its combined bounding-box center.
function flip(axis) {
  const center = axis === 'x' ? selectionCenter().x : selectionCenter().y
  store.commit('Flip', () => shapes.value.forEach((shape) => flipShape(shape, axis, center)))
}

// Reflect one shape's bbox about the line and invert its rotation.
function flipShape(shape, axis, center) {
  const box = axisAlignedBBox(shape)
  shape.rotation = (360 - (shape.rotation || 0)) % 360
  if (axis === 'x') shape.x += 2 * center - box.x - (box.x + box.w)
  else shape.y += 2 * center - box.y - (box.y + box.h)
}

// Center of the axis-aligned box enclosing the whole selection.
function selectionCenter() {
  const boxes = shapes.value.map(axisAlignedBBox)
  const minX = Math.min(...boxes.map((b) => b.x))
  const maxX = Math.max(...boxes.map((b) => b.x + b.w))
  const minY = Math.min(...boxes.map((b) => b.y))
  const maxY = Math.max(...boxes.map((b) => b.y + b.h))
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
}
</script>

<template>
  <PaletteSection v-if="hasShapes" label="Transform">
    <!-- Rotation is done with the on-canvas rotation handle now (D10), so the
         rotate-left/right buttons are gone. Swap lives in Distribute & size (a
         positional op) to avoid duplicating it here; Transform is just flips. -->
    <div class="grid grid-cols-6 gap-1.5">
      <ActionTile icon="flip-horizontal" label="Flip H" @click="flip('x')" />
      <ActionTile icon="flip-vertical" label="Flip V" @click="flip('y')" />
    </div>
  </PaletteSection>
</template>
