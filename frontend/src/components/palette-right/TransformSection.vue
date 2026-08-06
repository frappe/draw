<script setup>
// Transform: flip H/V (spec §4.3). Rotation is on-canvas via the selection
// rotation handle; Swap lives in Distribute & size. Each multi-step move is
// wrapped in store.commit so it is a single undo step.
import { computed } from 'vue'
import PaletteSection from './PaletteSection.vue'
import ActionTile from './ActionTile.vue'
import { axisAlignedBBox, unionBounds } from '@/diagram/geometry.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'

const store = useDiagramStore()

const shapes = computed(() => store.selectedShapes)
const hasShapes = computed(() => shapes.value.length > 0)

// Mirror the selection across the axis at its combined bounding-box center.
function flip(axis) {
  const center = axis === 'x' ? selectionCenter().x : selectionCenter().y
  store.commit('Flip', () => shapes.value.forEach((shape) => flipShape(shape, axis, center)))
}

// Reflect one shape's bbox about the line and toggle its own flip flag, which
// mirrors the shape's own content (triangle apex, arrow direction, image, text
// alignment — see ShapeView's `transform`). Rotation is left untouched: the
// flip flag is applied in the shape's local frame *before* rotation, so a
// rotated shape still flips correctly without any rotation-angle math (D10).
function flipShape(shape, axis, center) {
  const box = axisAlignedBBox(shape)
  if (axis === 'x') {
    shape.x += 2 * center - box.x - (box.x + box.w)
    shape.flipX = !shape.flipX
  } else {
    shape.y += 2 * center - box.y - (box.y + box.h)
    shape.flipY = !shape.flipY
  }
}

// Center of the axis-aligned box enclosing the whole selection.
function selectionCenter() {
  const bounds = unionBounds(shapes.value.map(axisAlignedBBox))
  if (!bounds) return { x: 0, y: 0 }
  return { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 }
}
</script>

<template>
  <PaletteSection v-if="hasShapes" label="Transform">
    <!-- Rotation is done with the on-canvas rotation handle now (D10), so the
         rotate-left/right buttons are gone. Swap lives in Distribute & size (a
         positional op) to avoid duplicating it here; Transform is just flips. -->
    <div class="grid grid-cols-2 gap-1.5">
      <ActionTile icon="lucide-flip-horizontal-2" label="Flip H" @click="flip('x')" />
      <ActionTile icon="lucide-flip-vertical-2" label="Flip V" @click="flip('y')" />
    </div>
  </PaletteSection>
</template>
