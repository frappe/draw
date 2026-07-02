<script setup>
// Endpoint + color + width controls for a whiteboard line. Used twice: bound to
// the tool defaults (new lines) and to a selected line (live edit). Pure — it
// reads the passed values and emits a patch; the parent decides where to apply
// it (ui.state defaults vs store.updateLine).
import LucideIcon from '@/icons/LucideIcon.vue'
import { CHALK_COLORS, PEN_WIDTHS } from '@/diagram/whiteboardColors.js'

const props = defineProps({
  start: { type: String, default: 'none' },
  end: { type: String, default: 'arrow' },
  color: { type: String, default: '#171717' },
  width: { type: Number, default: 2 },
})
const emit = defineEmits(['change'])

const startStyles = [
  { value: 'none', icon: 'minus', label: 'Plain' },
  { value: 'arrow', icon: 'arrow-left', label: 'Arrow' },
  { value: 'dot', icon: 'disc', label: 'Dot' },
]
const endStyles = [
  { value: 'none', icon: 'minus', label: 'Plain' },
  { value: 'arrow', icon: 'arrow-right', label: 'Arrow' },
  { value: 'dot', icon: 'disc', label: 'Dot' },
]

const cellActive = 'bg-surface-gray-3 text-ink-gray-9'
const cellIdle = 'text-ink-gray-7 hover:bg-surface-gray-2'
</script>

<template>
  <div class="w-52 p-2">
    <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-5">Start</div>
    <div class="mb-2 flex gap-1">
      <button
        v-for="s in startStyles"
        :key="s.value"
        class="flex h-7 flex-1 items-center justify-center rounded-md"
        :class="start === s.value ? cellActive : cellIdle"
        @click="emit('change', { start: s.value })"
      >
        <LucideIcon :name="s.icon" class="h-4 w-4" />
      </button>
    </div>
    <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-5">End</div>
    <div class="mb-2 flex gap-1">
      <button
        v-for="s in endStyles"
        :key="s.value"
        class="flex h-7 flex-1 items-center justify-center rounded-md"
        :class="end === s.value ? cellActive : cellIdle"
        @click="emit('change', { end: s.value })"
      >
        <LucideIcon :name="s.icon" class="h-4 w-4" />
      </button>
    </div>
    <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-5">Color</div>
    <div class="mb-2 grid grid-cols-8 gap-1.5">
      <button
        v-for="swatch in CHALK_COLORS"
        :key="swatch"
        class="h-5 w-5 rounded-full border"
        :class="color === swatch ? 'border-[1.5px] border-ink-gray-9' : 'border-outline-gray-2'"
        :style="{ background: swatch }"
        @click="emit('change', { color: swatch })"
      />
    </div>
    <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-5">Width</div>
    <div class="flex gap-2">
      <button
        v-for="w in PEN_WIDTHS"
        :key="w"
        class="flex h-7 flex-1 items-center justify-center rounded-md"
        :class="width === w ? cellActive : cellIdle"
        @click="emit('change', { width: w })"
      >
        <span class="rounded-full bg-surface-gray-10" :style="{ width: w + 'px', height: w + 'px' }" />
      </button>
    </div>
  </div>
</template>
