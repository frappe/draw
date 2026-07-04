<script setup>
// Row/column count + color controls for a whiteboard table. In 'create' mode
// (the insert-table menu) the primary control is a Google-Docs-style grid picker
// (T2); in 'edit' mode (a selected table) that picker is hidden and the size is
// adjusted with add/remove row & column steppers instead. Pure: emits a patch.
import { ref, computed } from 'vue'
import LucideIcon from '@/icons/LucideIcon.vue'
import { CHALK_COLORS } from '@/diagram/whiteboardColors.js'

const props = defineProps({
  rows: { type: Number, default: 3 },
  cols: { type: Number, default: 3 },
  color: { type: String, default: '#171717' },
  // 'create' → grid picker to size a new table; 'edit' → steppers on the table.
  mode: { type: String, default: 'create', validator: (v) => ['create', 'edit'].includes(v) },
})
const emit = defineEmits(['change'])

const MIN = 1
const MAX = 10

// Hover grid: choose rows×cols by sweeping over cells; click commits both.
const GRID_ROWS = 6
const GRID_COLS = 8
const hoverR = ref(0)
const hoverC = ref(0)
// The size label reflects the hovered cell, or the current value when not hovering.
const labelR = computed(() => hoverR.value || props.rows)
const labelC = computed(() => hoverC.value || props.cols)
function pickGrid(r, c) {
  emit('change', { rows: r, cols: c })
}

function step(field, delta) {
  const next = Math.max(MIN, Math.min(MAX, props[field] + delta))
  if (next !== props[field]) emit('change', { [field]: next })
}
</script>

<template>
  <div class="w-44 p-2">
    <!-- CREATE only: grid picker — sweep to size, click to commit (T2/Q8). -->
    <template v-if="mode === 'create'">
      <div class="mb-1 flex items-center justify-between">
        <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-gray-5">Size</span>
        <span class="text-[11px] font-medium text-ink-gray-7">{{ labelC }} × {{ labelR }}</span>
      </div>
      <div class="mb-2.5 inline-grid gap-0.5" style="grid-template-columns: repeat(8, 1fr)" @pointerleave="hoverR = 0; hoverC = 0">
        <template v-for="r in GRID_ROWS" :key="r">
          <button
            v-for="c in GRID_COLS"
            :key="`${r}-${c}`"
            class="h-[14px] w-[14px] rounded-[2px] border"
            :class="r <= (hoverR || rows) && c <= (hoverC || cols) ? 'border-ink-gray-9 bg-surface-gray-3' : 'border-outline-gray-2'"
            @pointerenter="hoverR = r; hoverC = c"
            @click="pickGrid(r, c)"
          />
        </template>
      </div>
    </template>

    <!-- EDIT only: an "add/remove row · column" hint above the steppers. -->
    <div v-else class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-5">Add / remove</div>

    <div class="mb-2 flex items-center justify-between">
      <span class="text-[12px] text-ink-gray-7">Rows</span>
      <div class="flex items-center gap-1.5">
        <button class="flex h-6 w-6 items-center justify-center rounded text-ink-gray-7 hover:bg-surface-gray-2" @click="step('rows', -1)">
          <LucideIcon name="minus" class="h-3.5 w-3.5" />
        </button>
        <span class="w-5 text-center text-[13px] font-medium text-ink-gray-9">{{ rows }}</span>
        <button class="flex h-6 w-6 items-center justify-center rounded text-ink-gray-7 hover:bg-surface-gray-2" @click="step('rows', 1)">
          <LucideIcon name="plus" class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
    <div class="mb-2 flex items-center justify-between">
      <span class="text-[12px] text-ink-gray-7">Columns</span>
      <div class="flex items-center gap-1.5">
        <button class="flex h-6 w-6 items-center justify-center rounded text-ink-gray-7 hover:bg-surface-gray-2" @click="step('cols', -1)">
          <LucideIcon name="minus" class="h-3.5 w-3.5" />
        </button>
        <span class="w-5 text-center text-[13px] font-medium text-ink-gray-9">{{ cols }}</span>
        <button class="flex h-6 w-6 items-center justify-center rounded text-ink-gray-7 hover:bg-surface-gray-2" @click="step('cols', 1)">
          <LucideIcon name="plus" class="h-3.5 w-3.5" />
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
