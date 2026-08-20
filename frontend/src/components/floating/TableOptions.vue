<script setup>
// Row/column count controls for a whiteboard table. In 'create' mode
// (the insert-table menu) the primary control is a Google-Docs-style grid picker
// (T2); in 'edit' mode (a selected table) that picker is hidden and the size is
// adjusted with add/remove row & column steppers instead. Pure: emits a patch.
import { ref, computed } from 'vue'
import { Button, Checkbox } from 'frappe-ui'

const props = defineProps({
  rows: { type: Number, default: 3 },
  cols: { type: Number, default: 3 },
  headerRows: { type: Number, default: 0 },
  headerCols: { type: Number, default: 0 },
  align: { type: String, default: 'left' },
  // 'create' → grid picker to size a new table; 'edit' → steppers on the table.
  mode: { type: String, default: 'create', validator: (v) => ['create', 'edit'].includes(v) },
})
const emit = defineEmits(['change'])

const MIN = 1
const MAX = 10

// Cell text alignment. `icon` is a complete lucide class (JIT reads it literally).
const ALIGN_OPTIONS = [
  { value: 'left', label: 'Align left', icon: 'lucide-align-left' },
  { value: 'center', label: 'Align center', icon: 'lucide-align-center' },
  { value: 'right', label: 'Align right', icon: 'lucide-align-right' },
]

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
  <div class="w-72 p-2.5">
    <!-- CREATE only: grid picker — sweep to size, click to commit (T2/Q8). -->
    <template v-if="mode === 'create'">
      <div class="mb-1 flex items-center justify-between">
        <span class="text-xs font-semibold text-ink-gray-5">Size</span>
        <span class="text-xs font-medium text-ink-gray-7">{{ labelC }} × {{ labelR }}</span>
      </div>
      <div class="mb-2.5 inline-grid gap-0.5" style="grid-template-columns: repeat(8, 1fr)" @pointerleave="hoverR = 0; hoverC = 0">
        <template v-for="r in GRID_ROWS" :key="r">
          <button
            v-for="c in GRID_COLS"
            :key="`${r}-${c}`"
            :aria-label="`${c} × ${r}`"
            class="h-[14px] w-[14px] rounded-[2px] border"
            :class="r <= (hoverR || rows) && c <= (hoverC || cols) ? 'border-outline-gray-9 bg-surface-gray-3' : 'border-outline-gray-2'"
            @pointerenter="hoverR = r; hoverC = c"
            @click="pickGrid(r, c)"
          />
        </template>
      </div>
    </template>

    <!-- EDIT only: an "add/remove row · column" hint above the steppers. Rows and
         columns sit side by side (#556 feedback: a single narrow column made this
         popup run well past the bottom of the screen), which is the same reason
         the header checkboxes and the header labels below are paired up too. -->
    <div v-else class="mb-1 text-xs font-semibold text-ink-gray-5">Add / remove</div>

    <div class="mb-2 grid grid-cols-2 gap-2">
      <div>
        <div class="mb-1 text-xs text-ink-gray-7">Rows</div>
        <div class="flex items-center gap-1">
          <Button variant="ghost" theme="gray" size="sm" icon="lucide-minus" label="Remove row" @click="step('rows', -1)" />
          <span class="w-5 text-center text-sm font-medium text-ink-gray-9">{{ rows }}</span>
          <Button variant="ghost" theme="gray" size="sm" icon="lucide-plus" label="Add row" @click="step('rows', 1)" />
        </div>
      </div>
      <div>
        <div class="mb-1 text-xs text-ink-gray-7">Columns</div>
        <div class="flex items-center gap-1">
          <Button variant="ghost" theme="gray" size="sm" icon="lucide-minus" label="Remove column" @click="step('cols', -1)" />
          <span class="w-5 text-center text-sm font-medium text-ink-gray-9">{{ cols }}</span>
          <Button variant="ghost" theme="gray" size="sm" icon="lucide-plus" label="Add column" @click="step('cols', 1)" />
        </div>
      </div>
    </div>

    <!-- A tinted, bold first row/column — a property of an existing table, so
         edit only (#338, #556). More rows/columns than the first become header
         from the table menu, which works on the selection (#553). -->
    <div v-if="mode === 'edit'" class="mb-2.5 grid grid-cols-2 gap-2">
      <Checkbox
        size="sm"
        label="Header row"
        :model-value="headerRows > 0"
        @update:model-value="emit('change', { headerRows: $event ? 1 : 0 })"
      />
      <Checkbox
        size="sm"
        label="Header column"
        :model-value="headerCols > 0"
        @update:model-value="emit('change', { headerCols: $event ? 1 : 0 })"
      />
    </div>

    <!-- Cell text alignment — edit only, a property of the whole table (#338). -->
    <template v-if="mode === 'edit'">
      <div class="mb-1 text-xs font-semibold text-ink-gray-5">Alignment</div>
      <div class="mb-1 flex gap-1">
        <Button
          v-for="option in ALIGN_OPTIONS"
          :key="option.value"
          :variant="align === option.value ? 'subtle' : 'ghost'"
          theme="gray"
          size="sm"
          :icon="option.icon"
          :tooltip="option.label"
          :label="option.label"
          @click="emit('change', { align: option.value })"
        />
      </div>
    </template>

    <!-- No colour grid here (#553). A table's one colour is the colour of its
         text, and it is set from the toolbar's text-colour control — the same
         control, in the same place, a text box has. -->
  </div>
</template>
