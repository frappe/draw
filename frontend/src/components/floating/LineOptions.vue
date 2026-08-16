<script setup>
// Endpoint + color + width controls for a whiteboard line. Used twice: bound to
// the tool defaults (new lines) and to a selected line (live edit). Pure — it
// reads the passed values and emits a patch; the parent decides where to apply
// it (ui.state defaults vs store.updateLine).
import { PEN_WIDTHS } from '@/diagram/whiteboardColors.js'
import EspressoSwatchGrid from '@/components/palette-right/EspressoSwatchGrid.vue'

defineProps({
  start: { type: String, default: 'none' },
  end: { type: String, default: 'arrow' },
  color: { type: String, default: '#171717' },
  width: { type: Number, default: 2 },
})
const emit = defineEmits(['change'])

const startStyles = [
  { value: 'none', icon: 'lucide-minus', label: 'Plain' },
  { value: 'arrow', icon: 'lucide-arrow-left', label: 'Arrow' },
  { value: 'dot', icon: 'lucide-disc', label: 'Dot' },
]
const endStyles = [
  { value: 'none', icon: 'lucide-minus', label: 'Plain' },
  { value: 'arrow', icon: 'lucide-arrow-right', label: 'Arrow' },
  { value: 'dot', icon: 'lucide-disc', label: 'Dot' },
]

const cellActive = 'bg-surface-gray-3 text-ink-gray-9'
const cellIdle = 'text-ink-gray-7 hover:bg-surface-gray-2'
</script>

<template>
  <div class="p-2">
    <div class="mb-1 text-2xs font-semibold text-ink-gray-5">Start</div>
    <div class="mb-2 flex gap-1">
      <button
        v-for="s in startStyles"
        :key="s.value"
        :aria-label="`Start: ${s.label}`"
        :aria-pressed="start === s.value"
        class="flex h-7 flex-1 items-center justify-center rounded-md"
        :class="start === s.value ? cellActive : cellIdle"
        @click="emit('change', { start: s.value })"
      >
        <span class="h-4 w-4" aria-hidden="true" :class="s.icon" />
      </button>
    </div>
    <div class="mb-1 text-2xs font-semibold text-ink-gray-5">End</div>
    <div class="mb-2 flex gap-1">
      <button
        v-for="s in endStyles"
        :key="s.value"
        :aria-label="`End: ${s.label}`"
        :aria-pressed="end === s.value"
        class="flex h-7 flex-1 items-center justify-center rounded-md"
        :class="end === s.value ? cellActive : cellIdle"
        @click="emit('change', { end: s.value })"
      >
        <span class="h-4 w-4" aria-hidden="true" :class="s.icon" />
      </button>
    </div>
    <div class="mb-1 text-2xs font-semibold text-ink-gray-5">Color</div>
    <!-- The shared Espresso grid (#495), so a line is coloured from the same
         palette as everything else rather than from CHALK_COLORS, a near-miss list
         of its own. allow-none is false: a line with no stroke colour vanishes. -->
    <div class="mb-2">
      <EspressoSwatchGrid
        mode="fill"
        :model-value="color"
        :allow-none="false"
        @select="emit('change', { color: $event })"
      />
    </div>
    <div class="mb-1 text-2xs font-semibold text-ink-gray-5">Width</div>
    <div class="flex gap-2">
      <button
        v-for="w in PEN_WIDTHS"
        :key="w"
        :aria-label="`Width ${w}`"
        :aria-pressed="width === w"
        class="flex h-7 flex-1 items-center justify-center rounded-md"
        :class="width === w ? cellActive : cellIdle"
        @click="emit('change', { width: w })"
      >
        <span class="rounded-full bg-surface-gray-10" :style="{ width: w + 'px', height: w + 'px' }" />
      </button>
    </div>
  </div>
</template>
