<script setup>
// Dotted grid rendered UNDER all shapes (spec §4.1), toggled by editorUi via
// the v-if in DiagramCanvas. Two densities (dense/sparse). Dots are #DCDCDF.
// It is NEVER part of the diagram: the data-grid / data-export-exclude markers
// let the export + thumbnail passes strip this layer before rasterizing.
import { computed } from 'vue'

const props = defineProps({
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  density: { type: String, default: 'dense' },
})

const DENSE_SPACING = 24
const SPARSE_SPACING = 48
const DOT_RADIUS = 1.5

const spacing = computed(() =>
  props.density === 'sparse' ? SPARSE_SPACING : DENSE_SPACING,
)

// Unique id per density so switching never reuses a stale pattern definition.
const patternId = computed(() => `fd-grid-dots-${props.density}`)
const patternUrl = computed(() => `url(#${patternId.value})`)
</script>

<template>
  <g data-grid data-export-exclude>
    <defs>
      <pattern
        :id="patternId"
        :width="spacing"
        :height="spacing"
        patternUnits="userSpaceOnUse"
      >
        <circle
          :cx="spacing / 2"
          :cy="spacing / 2"
          :r="DOT_RADIUS"
          fill="#DCDCDF"
        />
      </pattern>
    </defs>
    <rect :width="width" :height="height" :fill="patternUrl" />
  </g>
</template>
