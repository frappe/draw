<script setup>
// Smart alignment guides: pink dashed lines + a small label pill during drag
// (signature, spec §7.6). Guides come from the shared useSmartGuides instance
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

// Pill geometry per guide: width scales with label length; placed near the
// line's near end. Sizes stay in logical units so they scale with zoom.
const PILL_HEIGHT = 16
const PILL_PADDING = 5
const CHAR_WIDTH = 6

function pillWidth(label) {
  return label.length * CHAR_WIDTH + PILL_PADDING * 2
}

function pillX(guide) {
  return Math.min(guide.x1, guide.x2)
}

function pillY(guide) {
  return Math.min(guide.y1, guide.y2)
}
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
      <g v-if="guide.label" :transform="`translate(${pillX(guide)} ${pillY(guide)})`">
        <rect
          :width="pillWidth(guide.label)"
          :height="PILL_HEIGHT"
          rx="8"
          fill="#E34AA6"
        />
        <text
          :x="pillWidth(guide.label) / 2"
          :y="PILL_HEIGHT / 2"
          fill="#FFFFFF"
          font-size="9"
          font-family="Inter, sans-serif"
          text-anchor="middle"
          dominant-baseline="central"
        >
          {{ guide.label }}
        </text>
      </g>
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
      <g :transform="`translate(${m.mx - measurePillW(m.label) / 2} ${m.my - M_PILL_H / 2})`">
        <rect :width="measurePillW(m.label)" :height="M_PILL_H" rx="3" fill="#3B82F6" />
        <text
          :x="measurePillW(m.label) / 2"
          :y="M_PILL_H / 2"
          fill="#FFFFFF"
          font-size="9"
          font-family="Inter, sans-serif"
          text-anchor="middle"
          dominant-baseline="central"
        >
          {{ m.label }}
        </text>
      </g>
    </template>
  </g>
</template>
