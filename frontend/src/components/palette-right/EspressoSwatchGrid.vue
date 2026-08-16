<script setup>
// A curated Espresso colour grid for mind-map node fill / border (#274), replacing
// the full HSV/hex/eyedropper picker on nodes. Families are rows, shades are
// columns. In `fill` mode each swatch is a filled rounded square; in `border` mode
// it is a white square ringed in the colour — matching how the value will read on
// the node. Presentational: it emits the chosen colour (or null for "None"); the
// parent writes it to the shape. Swatch VALUES are literal canvas colours (the SVG
// canvas is the token exception); the chrome around them uses frappe-ui tokens.
import { computed } from 'vue'
import { ESPRESSO_FAMILIES, NEUTRALS, SHADE_LEVELS, nearestSwatch } from '@/diagram/espressoPalette.js'

const props = defineProps({
  mode: { type: String, default: 'fill' }, // 'fill' | 'border'
  modelValue: { type: String, default: null },
  allowNone: { type: Boolean, default: true },
})
const emit = defineEmits(['select'])

// The "None" sentinel per mode: a node with no fill / no border.
const NONE = props.mode === 'border' ? 'transparent' : 'none'

// The swatch to ring: the stored colour when it is one of these, else the closest
// one (#495). A diagram made before the palettes were unified holds values from the
// older SWATCH_PALETTE — genuinely different colours — and matching by string left
// the picker looking unset on a shape that plainly had a colour. Nothing is
// rewritten; the ring only says which swatch the current value is nearest to.
const selectedSwatch = computed(() => nearestSwatch(props.modelValue))

function isSelected(value) {
  const current = (props.modelValue || '').toLowerCase()
  if (current === value.toLowerCase()) return true
  // "None" is a sentinel, not a colour, so it is only ever an exact match.
  if (value === NONE) return false
  return selectedSwatch.value?.toLowerCase() === value.toLowerCase()
}
</script>

<template>
  <div class="flex flex-col gap-2 p-1">
    <div class="flex items-center gap-1.5">
      <button
        v-if="allowNone"
        type="button"
        class="size-5 rounded border border-outline-gray-2 bg-surface-elevation-1"
        :class="isSelected(NONE) ? 'ring-2 ring-outline-gray-4' : ''"
        title="None"
        aria-label="None"
        @click="emit('select', null)"
      >
        <span class="lucide-slash size-3.5 text-ink-gray-5" aria-hidden="true" />
      </button>
      <!-- A stronger outline than the hairline every other swatch wears (#474). A
           white square on a white panel behind `outline-gray-2` was invisible — it
           read as a gap in the row rather than as the colour you can pick. This is
           the opposite treatment from the Fill BUTTON, where white resolves to grey:
           there the swatch reports the current value and can afford to merge, here
           it is a target that has to be seen and aimed at. -->
      <button
        v-for="(hex, name) in NEUTRALS"
        :key="name"
        type="button"
        class="size-5 rounded border border-outline-gray-4"
        :class="isSelected(hex) ? 'ring-2 ring-outline-gray-4' : ''"
        :style="mode === 'border' ? { borderColor: hex, borderWidth: '3px', background: '#ffffff' } : { background: hex }"
        :title="name"
        :aria-label="name"
        @click="emit('select', hex)"
      />
    </div>

    <div class="grid grid-cols-6 gap-1.5">
      <template v-for="family in ESPRESSO_FAMILIES" :key="family.name">
        <button
          v-for="(hex, shade) in family.shades"
          :key="hex"
          type="button"
          class="size-5 rounded border border-outline-gray-2"
          :class="isSelected(hex) ? 'ring-2 ring-outline-gray-4' : ''"
          :style="mode === 'border' ? { borderColor: hex, borderWidth: '3px', background: '#ffffff' } : { background: hex, borderColor: 'transparent' }"
          :title="`${family.name} ${SHADE_LEVELS[shade]}`"
          :aria-label="`${family.name} ${SHADE_LEVELS[shade]}`"
          @click="emit('select', hex)"
        />
      </template>
    </div>
  </div>
</template>
