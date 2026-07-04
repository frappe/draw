<script setup>
// A wrap-flow grid of colour swatch buttons, shared by the selection-editor
// colour popovers (mind-map fill/border/branch, flowchart fill). Presentational:
// it emits `select(color)`; the caller owns the store write. `shape` picks a
// rounded square (fills) or a circle (borders/branch accents).
defineProps({
  colors: { type: Array, required: true },
  shape: { type: String, default: 'round', validator: (v) => ['round', 'square'].includes(v) },
})
defineEmits(['select'])
</script>

<template>
  <div class="flex flex-wrap gap-1.5">
    <button
      v-for="c in colors"
      :key="c"
      class="h-6 w-6 border border-black/10"
      :class="shape === 'square' ? 'rounded-md' : 'rounded-full'"
      :style="{ background: c }"
      @click="$emit('select', c)"
    />
  </div>
</template>
