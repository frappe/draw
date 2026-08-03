<script setup>
// Writer-style hover grid for sizing a new table (#134). Sweeping the grid — or
// the arrow keys — picks rows × columns; a click (or Enter) commits that exact
// size. The component is presentational: it emits `pick` with { rows, cols } and
// never touches the document, so the caller decides where the table lands. The
// grid maths and the readout live in tableSizePicker.js so they stay testable
// without a DOM. Rendered inside a frappe-ui Popover by the Table tool.
import { ref, nextTick, onMounted, useTemplateRef } from 'vue'
import {
  MAX_TABLE_ROWS,
  MAX_TABLE_COLS,
  isCellFilled,
  sizeReadout,
  clampDimension,
} from './tableSizePicker.js'

const emit = defineEmits(['pick'])

// The size currently spanned. Starts at 1×1 so nothing about the picker implies
// the old fixed 3×3 — the user actively sweeps or arrows to the size they want.
const rows = ref(1)
const cols = ref(1)
const grid = useTemplateRef('grid')

// The grid is the keyboard surface: focus it on open so arrows / Enter work
// without a click first (Frappe Writer's picker does the same).
onMounted(() => void nextTick(() => grid.value?.focus()))

function hover(r, c) {
  rows.value = r
  cols.value = c
}
function commit(r, c) {
  emit('pick', { rows: r, cols: c })
}
function onKeydown(event) {
  const steps = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1] }
  const delta = steps[event.key]
  if (delta) {
    event.preventDefault()
    rows.value = clampDimension(rows.value + delta[0], MAX_TABLE_ROWS)
    cols.value = clampDimension(cols.value + delta[1], MAX_TABLE_COLS)
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    commit(rows.value, cols.value)
  }
}
</script>

<template>
  <div class="w-max p-2">
    <div class="mb-1.5 text-center text-[11px] font-medium text-ink-gray-7">{{ sizeReadout(rows, cols) }}</div>
    <div
      ref="grid"
      tabindex="0"
      role="grid"
      :aria-label="`Table size, ${rows} rows by ${cols} columns`"
      class="grid gap-1 outline-none"
      :style="{ gridTemplateColumns: `repeat(${MAX_TABLE_COLS}, 1fr)` }"
      @keydown="onKeydown"
    >
      <template v-for="r in MAX_TABLE_ROWS" :key="r">
        <button
          v-for="c in MAX_TABLE_COLS"
          :key="`${r}-${c}`"
          type="button"
          tabindex="-1"
          class="h-4 w-4 rounded-[3px] border"
          :class="isCellFilled(r, c, rows, cols) ? 'border-ink-gray-9 bg-surface-gray-3' : 'border-outline-gray-2 bg-surface-gray-1'"
          :aria-label="`${r} × ${c}`"
          @pointerenter="hover(r, c)"
          @focus="hover(r, c)"
          @click="commit(r, c)"
        />
      </template>
    </div>
  </div>
</template>
