<script setup>
// Size (create) + color controls for a whiteboard table. In 'create' mode (the
// insert-table menu) the primary control is a Google-Docs-style grid picker
// (T2). In 'edit' mode (a selected table) the picker is dropped — row/column
// add-remove now lives in frappe-ui's EditorTableMenu, shown while the table is
// open for editing (#254) — so only the color swatches remain. Pure: emits a
// patch.
import { ref, computed } from 'vue'
import { CHALK_COLORS } from '@/diagram/whiteboardColors.js'

const props = defineProps({
  rows: { type: Number, default: 3 },
  cols: { type: Number, default: 3 },
  color: { type: String, default: '#171717' },
  // 'create' → grid picker to size a new table; 'edit' → color only.
  mode: { type: String, default: 'create', validator: (v) => ['create', 'edit'].includes(v) },
})
const emit = defineEmits(['change'])

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
