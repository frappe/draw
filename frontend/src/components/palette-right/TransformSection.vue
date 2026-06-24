<script setup>
// Transform: swap, rotate 90°, flip, and the format-painter toggle (spec §4.3).
// Swap needs exactly two shapes; rotate/flip need 1+. Painter toggles editorUi.
// Each multi-step move is wrapped in store.commit so it is a single undo step.
import { computed } from 'vue'
import PaletteSection from './PaletteSection.vue'
import ActionTile from './ActionTile.vue'
import { axisAlignedBBox, shapeCenter } from '@/diagram/geometry.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useFormatPainter } from '@/composables/useFormatPainter.js'

const store = useDiagramStore()
const editorUi = useEditorUi()
const painter = useFormatPainter(store, editorUi)

// Toggle the painter: when arming, copy the (first) selected shape's formatting
// so a subsequent canvas click stamps real style (spec §4.3). When already on,
// just turn it off.
function togglePainter() {
  if (painter.isActive()) painter.cancel()
  else if (shapes.value.length) painter.copyFrom(shapes.value[0].id)
}

const shapes = computed(() => store.selectedShapes)
const hasShapes = computed(() => shapes.value.length > 0)
const canSwap = computed(() => shapes.value.length === 2)

// Rotate every selected shape by ±90°, normalised to 0–359. Fields are mutated
// inside one commit (not via updateShape) so the rotation is one undo step.
function rotate(delta) {
  store.commit('Rotate', () => {
    for (const shape of shapes.value) {
      shape.rotation = ((((shape.rotation || 0) + delta) % 360) + 360) % 360
    }
  })
}

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

// Swap the two selected shapes so each takes the other's center.
function swap() {
  const [a, b] = shapes.value
  const centerA = shapeCenter(a)
  const centerB = shapeCenter(b)
  store.commit('Swap', () => {
    a.x = centerB.x - a.w / 2
    a.y = centerB.y - a.h / 2
    b.x = centerA.x - b.w / 2
    b.y = centerA.y - b.h / 2
  })
}
</script>

<template>
  <PaletteSection v-if="hasShapes" label="Transform">
    <div class="grid grid-cols-6 gap-1.5">
      <ActionTile v-if="canSwap" icon="repeat" label="Swap" @click="swap()" />
      <ActionTile icon="rotate-ccw" label="Rotate L" @click="rotate(-90)" />
      <ActionTile icon="rotate-cw" label="Rotate R" @click="rotate(90)" />
      <ActionTile icon="flip-horizontal" label="Flip H" @click="flip('x')" />
      <ActionTile icon="flip-vertical" label="Flip V" @click="flip('y')" />
      <ActionTile
        icon="edit-3"
        label="Painter"
        :active="editorUi.state.formatPainter.active"
        @click="togglePainter()"
      />
    </div>
  </PaletteSection>
</template>
