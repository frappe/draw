<script setup>
// Fill, border and — for a mind-map node — corner curve, for the current block
// selection (#361). Moved off BlockSelectionEditor unchanged; the panel bodies
// are the same palette-right sections, so multi-selection intersection and every
// other behaviour is shared rather than reimplemented.
import { computed } from 'vue'
import { Popover, TabButtons } from 'frappe-ui'
import { useBlockSelection } from '@/composables/useBlockSelection.js'
import { isMindmapShape } from '@/diagram/freeFloating.js'
import { hasFill, hasBorder } from '@/diagram/mindmapNodeStyle.js'
import { inkFor } from '@/diagram/espressoPalette.js'
import EspressoSwatchGrid from '@/components/palette-right/EspressoSwatchGrid.vue'
import FillBorderSection from '@/components/palette-right/FillBorderSection.vue'
import TransparencySection from '@/components/palette-right/TransparencySection.vue'
import ToolbarButton from '../ToolbarButton.vue'

const { store, shapes, shapeIds } = useBlockSelection()

const primaryFill = computed(() => shapes.value[0]?.fill || '#ffffff')
const primaryBorder = computed(() => shapes.value[0]?.border?.color || '#171717')

const panel = 'max-h-[70vh] w-[300px] overflow-y-auto'

// A mind-map node selection swaps the full colour picker for the curated
// Espresso grid and gains a per-node corner curve (#274 / #260).
const isNodeSelection = computed(
  () => shapes.value.length > 0 && shapes.value.every((shape) => isMindmapShape(shape)),
)
const nodeCurve = computed(() => shapes.value[0]?.mindmap?.curve || 'moderate')
const CURVE_OPTIONS = [
  { label: 'None', value: 'none' },
  { label: 'Moderate', value: 'moderate' },
  { label: 'High', value: 'high' },
]

// A colour boxes the node (keeping its text readable); "None" clears the fill,
// and the node stays shaped only while it still has a border.
function setNodeFill(hex) {
  if (!shapeIds.value.length) return
  if (hex === null) {
    store.updateShapes(shapeIds.value, { fill: 'none', mindmap: { shaped: hasBorder(shapes.value[0]) } })
  } else {
    store.updateShapes(shapeIds.value, { fill: hex, text: { style: { color: inkFor(hex) } }, mindmap: { shaped: true } })
  }
}

// "None" removes the stroke; the node stays shaped only while it still has a fill.
function setNodeBorder(hex) {
  if (!shapeIds.value.length) return
  if (hex === null) {
    store.updateShapes(shapeIds.value, { border: { color: 'transparent', width: 0 }, mindmap: { shaped: hasFill(shapes.value[0]) } })
  } else {
    const width = shapes.value[0]?.border?.width > 0 ? shapes.value[0].border.width : 1.5
    store.updateShapes(shapeIds.value, { border: { color: hex, width }, mindmap: { shaped: true } })
  }
}

function setNodeCurve(value) {
  if (shapeIds.value.length) store.updateShapes(shapeIds.value, { mindmap: { curve: value } })
}
</script>

<template>
  <!-- Fill and Border are separate entries, each opening its own colour picker;
       opacity lives with Fill. -->
  <Popover>
    <template #trigger>
      <ToolbarButton label="Fill">
        <template #icon>
          <span class="h-4 w-4 rounded-full border border-outline-gray-4" :style="{ background: primaryFill }" />
        </template>
      </ToolbarButton>
    </template>
    <template #default>
      <div :class="panel">
        <EspressoSwatchGrid v-if="isNodeSelection" mode="fill" :model-value="primaryFill" @select="setNodeFill" />
        <template v-else><FillBorderSection mode="fill" /><TransparencySection /></template>
      </div>
    </template>
  </Popover>

  <Popover>
    <template #trigger>
      <ToolbarButton label="Border">
        <template #icon>
          <span class="h-4 w-4 rounded-full border-[3px] bg-surface-base" :style="{ borderColor: primaryBorder }" />
        </template>
      </ToolbarButton>
    </template>
    <template #default>
      <div :class="panel">
        <EspressoSwatchGrid v-if="isNodeSelection" mode="border" :model-value="primaryBorder" @select="setNodeBorder" />
        <FillBorderSection v-else mode="border" />
      </div>
    </template>
  </Popover>

  <Popover v-if="isNodeSelection">
    <template #trigger>
      <ToolbarButton label="Corners" icon="lucide-spline" />
    </template>
    <template #default>
      <div class="p-2">
        <TabButtons size="sm" :model-value="nodeCurve" :options="CURVE_OPTIONS" @update:model-value="setNodeCurve" />
      </div>
    </template>
  </Popover>
</template>
