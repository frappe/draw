<script setup>
// Smart alignment guides: pink dashed lines during a drag, and blue distance
// measurements with a px badge (signature, spec §7.6).
//
// The pink line carries NO label (#471). It used to draw a small pill naming the
// edge it had snapped to, but the line already shows what it is showing, and the
// word only added something to read mid-drag. The BLUE number stays: it reports the
// actual gap between two shapes, which a line on its own cannot.
//
// Guides come from the shared useSmartGuides instance
// so no props need plumbing through DiagramCanvas; an explicit `guides` prop
// still overrides for testing. Renders inside the canvas <g> (logical units).
import { computed } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useSmartGuides } from '@/composables/useSmartGuides.js'

const props = defineProps({
  guides: { type: Array, default: null },
})

const store = useDiagramStore()
const smartGuides = useSmartGuides(store)

const lines = computed(() => props.guides ?? smartGuides.guides.value)
const measurements = computed(() => (props.guides ? [] : smartGuides.measurements.value))

// Measurement pill geometry (logical units → scales with zoom).
const M_PILL_H = 14
function measurePillW(label) {
  return label.length * 6 + 8
}

// The pink guide's own pill, and the four helpers that placed and sized it, are
// gone with it (#471). `guide.label` is still produced upstream by the smart-guides
// calculation; it is simply no longer drawn.
</script>

<template>
  <g data-smart-guides>
    <template v-for="(guide, index) in lines" :key="index">
      <line
        :x1="guide.x1"
        :y1="guide.y1"
        :x2="guide.x2"
        :y2="guide.y2"
        stroke="#E34AA6"
        stroke-width="1"
        stroke-dasharray="4 3"
      />
    </template>

    <!-- Live spacing measurements (spec 4.2): a blue distance line with end caps
         and a px badge between the moving shape and its nearest neighbour. -->
    <template v-for="(m, index) in measurements" :key="`m-${index}`">
      <line :x1="m.x1" :y1="m.y1" :x2="m.x2" :y2="m.y2" stroke="#3B82F6" stroke-width="1" />
      <line
        v-if="m.kind === 'h'"
        :x1="m.x1" :y1="m.y1 - 4" :x2="m.x1" :y2="m.y1 + 4" stroke="#3B82F6" stroke-width="1"
      />
      <line
        v-if="m.kind === 'h'"
        :x1="m.x2" :y1="m.y2 - 4" :x2="m.x2" :y2="m.y2 + 4" stroke="#3B82F6" stroke-width="1"
      />
      <line
        v-if="m.kind === 'v'"
        :x1="m.x1 - 4" :y1="m.y1" :x2="m.x1 + 4" :y2="m.y1" stroke="#3B82F6" stroke-width="1"
      />
      <line
        v-if="m.kind === 'v'"
        :x1="m.x2 - 4" :y1="m.y2" :x2="m.x2 + 4" :y2="m.y2" stroke="#3B82F6" stroke-width="1"
      />
      <g :transform="`translate(${m.mx - measurePillW(m.equal ? m.label + ' =' : m.label) / 2} ${m.my - M_PILL_H / 2})`">
        <rect
          :width="measurePillW(m.equal ? m.label + ' =' : m.label)"
          :height="M_PILL_H"
          rx="3"
          :fill="m.equal ? '#E34AA6' : '#3B82F6'"
        />
        <text
          :x="measurePillW(m.equal ? m.label + ' =' : m.label) / 2"
          :y="M_PILL_H / 2"
          fill="#FFFFFF"
          font-size="9"
          font-family="Inter, sans-serif"
          text-anchor="middle"
          dominant-baseline="central"
        >
          {{ m.equal ? m.label + ' =' : m.label }}
        </text>
      </g>
    </template>
  </g>
</template>
