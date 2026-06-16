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
  </g>
</template>
