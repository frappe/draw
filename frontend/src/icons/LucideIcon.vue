<script setup>
// Drop-in replacement for frappe-ui's <FeatherIcon>: same `name` API and the
// same sizing contract (no intrinsic width/height — size it with h-/w-/size-
// classes or a style, tint with text-* / currentColor), but renders lucide
// glyphs to match frappe-ui 1.0. Legacy feather names resolve through
// LUCIDE_ALIAS; unknown names fall back to a circle (with a dev warning).
import { computed } from 'vue'
import ICON_NODES from './lucideNodes.js'
import { LUCIDE_ALIAS } from './lucideAlias.js'

const props = defineProps({
  name: { type: String, required: true },
  // Kept for <FeatherIcon> parity; lucide glyphs are normalized to 1.5.
  strokeWidth: { type: [Number, String], default: 1.5 },
})

const nodes = computed(() => {
  const resolved = LUCIDE_ALIAS[props.name] || props.name
  const found = ICON_NODES[resolved]
  if (!found && import.meta.env.DEV) {
    console.warn(`[LucideIcon] unknown icon "${props.name}" — rendering fallback`)
  }
  return found || ICON_NODES.circle
})
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="shrink-0"
  >
    <component
      :is="tag"
      v-for="([tag, attrs], i) in nodes"
      :key="i"
      v-bind="attrs"
    />
  </svg>
</template>
