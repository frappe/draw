<script setup>
// Row/column count + color controls for a whiteboard table. Used for the tool
// defaults (new tables) and for a selected table (live edit). Pure: emits a patch.
import { FeatherIcon } from 'frappe-ui'
import { CHALK_COLORS } from '@/diagram/whiteboardColors.js'

const props = defineProps({
  rows: { type: Number, default: 3 },
  cols: { type: Number, default: 3 },
  color: { type: String, default: '#171717' },
})
const emit = defineEmits(['change'])

const MIN = 1
const MAX = 10

function step(field, delta) {
  const next = Math.max(MIN, Math.min(MAX, props[field] + delta))
  if (next !== props[field]) emit('change', { [field]: next })
}
</script>

<template>
  <div class="w-44 p-2">
    <div class="mb-2 flex items-center justify-between">
      <span class="text-[12px] text-ink-gray-7">Rows</span>
      <div class="flex items-center gap-1.5">
        <button class="flex h-6 w-6 items-center justify-center rounded text-ink-gray-7 hover:bg-surface-gray-2" @click="step('rows', -1)">
          <FeatherIcon name="minus" class="h-3.5 w-3.5" />
        </button>
        <span class="w-5 text-center text-[13px] font-medium text-ink-gray-9">{{ rows }}</span>
        <button class="flex h-6 w-6 items-center justify-center rounded text-ink-gray-7 hover:bg-surface-gray-2" @click="step('rows', 1)">
          <FeatherIcon name="plus" class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
    <div class="mb-2 flex items-center justify-between">
      <span class="text-[12px] text-ink-gray-7">Columns</span>
      <div class="flex items-center gap-1.5">
        <button class="flex h-6 w-6 items-center justify-center rounded text-ink-gray-7 hover:bg-surface-gray-2" @click="step('cols', -1)">
          <FeatherIcon name="minus" class="h-3.5 w-3.5" />
        </button>
        <span class="w-5 text-center text-[13px] font-medium text-ink-gray-9">{{ cols }}</span>
        <button class="flex h-6 w-6 items-center justify-center rounded text-ink-gray-7 hover:bg-surface-gray-2" @click="step('cols', 1)">
          <FeatherIcon name="plus" class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
    <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-5">Color</div>
    <div class="grid grid-cols-8 gap-1.5">
      <button
        v-for="swatch in CHALK_COLORS"
        :key="swatch"
        class="h-5 w-5 rounded-full border"
        :class="color === swatch ? 'border-[1.5px] border-ink-gray-9' : 'border-outline-gray-2'"
        :style="{ background: swatch }"
        @click="emit('change', { color: swatch })"
      />
    </div>
  </div>
</template>
