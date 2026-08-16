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
import { CORNER_RADIUS_OPTIONS, supportsCornerRounding, shapeCornerRadius } from '@/diagram/shapeGeometry.js'
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

// A box shape picks its own roundedness from the presets (#411), and drags the
// corner dot for anything between them (#451). Every box shape qualifies now, not
// only the rounded rectangle: a plain rectangle is sharp by default and needs a
// way back. It shares the Corners popover with a node's branch curve — the
// selection is one or the other, never both, so the two controls can't collide.
const isRoundedBoxSelection = computed(
  () => shapes.value.length > 0 && shapes.value.every(supportsCornerRounding),
)
const boxCornerRadius = computed(() =>
  shapeCornerRadius(shapes.value[0]?.type, shapes.value[0]?.cornerRadius),
)
function setBoxCornerRadius(radius) {
  if (shapeIds.value.length) store.updateShapes(shapeIds.value, { cornerRadius: radius })
}

// The swatch previews the shape at a quarter of its size, radius included: on a
// smaller box, border-radius clamps to half the height and 12 / 20 / 32 would all
// render as the same pill, making three of the four presets indistinguishable.
const PREVIEW_SCALE = 0.25
function previewRadiusStyle(radius) {
  return { borderRadius: `${radius * PREVIEW_SCALE}px` }
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

  <!-- One Corners entry, two controls: a node's branch curve, or a rounded
       rectangle's own roundedness (#411). -->
  <Popover v-if="isNodeSelection || isRoundedBoxSelection">
    <template #trigger>
      <ToolbarButton label="Corners" icon="lucide-spline" />
    </template>
    <template #default>
      <div class="p-2">
        <TabButtons
          v-if="isNodeSelection"
          size="sm"
          :model-value="nodeCurve"
          :options="CURVE_OPTIONS"
          @update:model-value="setNodeCurve"
        />
        <div v-else class="flex items-center gap-1.5">
          <!-- frappe-ui-exempt: the swatch IS a scaled preview of the literal corner radius, which no Button variant can draw --><button
            v-for="radius in CORNER_RADIUS_OPTIONS"
            :key="radius"
            type="button"
            :aria-label="`Corner radius ${radius}`"
            :aria-pressed="boxCornerRadius === radius"
            class="flex h-9 w-14 items-center justify-center rounded-md"
            :class="boxCornerRadius === radius ? 'bg-surface-gray-3' : 'bg-surface-gray-1 hover:bg-surface-gray-2'"
            @click="setBoxCornerRadius(radius)"
          >
            <span class="block h-6 w-11 border-[1.5px] border-outline-gray-4" :style="previewRadiusStyle(radius)" />
          </button>
        </div>
      </div>
    </template>
  </Popover>
</template>
