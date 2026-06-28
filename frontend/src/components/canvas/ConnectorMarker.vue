<script setup>
// One SVG <marker> for a connector endpoint, shaped by type and tinted by the
// connector color. Used twice per connector (start + end). 'none' renders no
// marker (the parent omits the marker-* reference). Shapes live in a 0..10 box;
// arrows point toward the tip (refX near 10), symmetric heads center (refX 5).
import { computed } from 'vue'

const props = defineProps({
  id: { type: String, required: true },
  type: { type: String, default: 'none' },
  color: { type: String, default: '#7C7C7C' },
  orient: { type: String, default: 'auto' }, // 'auto' for end, 'auto-start-reverse' for start
})

// Arrows anchor at their tip; symmetric heads anchor at their center.
const refX = computed(() => (props.type === 'arrow' || props.type === 'open-arrow' ? 9 : 5))
</script>

<template>
  <marker
    :id="id"
    viewBox="0 0 10 10"
    :refX="refX"
    refY="5"
    markerWidth="8"
    markerHeight="8"
    :orient="orient"
  >
    <path v-if="type === 'arrow'" d="M0,0 L10,5 L0,10 z" :fill="color" />
    <path v-else-if="type === 'open-arrow'" d="M0,1 L9,5 L0,9" fill="none" :stroke="color" stroke-width="1.6" />
    <circle v-else-if="type === 'circle'" cx="5" cy="5" r="4" :fill="color" />
    <rect v-else-if="type === 'square'" x="1" y="1" width="8" height="8" :fill="color" />
    <polygon v-else-if="type === 'diamond'" points="5,0 10,5 5,10 0,5" :fill="color" />
  </marker>
</template>
