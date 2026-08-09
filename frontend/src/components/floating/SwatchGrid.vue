<script setup>
// A wrap-flow grid of colour swatch buttons, shared by the selection-editor
// colour popovers (mind-map fill/branch/border, flowchart fill). Presentational:
// it emits `select(color)`; the caller owns the store write. `shape` picks a
// rounded square (fills), a filled circle (branch accents) or a ring — a
// hollow ring where the colour is the outline, so a border picker reads as a
// border rather than a fill.
defineProps({
  colors: { type: Array, required: true },
  shape: { type: String, default: 'round', validator: (v) => ['round', 'square', 'ring'].includes(v) },
})
defineEmits(['select'])
</script>

<template>
  <div class="flex flex-wrap gap-1.5">
    <button
      v-for="c in colors"
      :key="c"
      :aria-label="`Colour ${c}`"
      class="h-6 w-6"
      :class="[
        shape === 'square' ? 'rounded-md border border-outline-gray-2' : 'rounded-full',
        shape === 'ring' ? 'border-[3px] bg-surface-base' : shape === 'round' ? 'border border-outline-gray-2' : '',
      ]"
      :style="shape === 'ring' ? { borderColor: c } : { background: c }"
      @click="$emit('select', c)"
    />
  </div>
</template>
