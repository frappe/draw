<script setup>
// One whiteboard table — a fixed grid with per-cell text (spec diagram-types
// Part C9). The grid + committed cell text render as SVG; double-clicking a cell
// (handled by the surface onDoubleClick) sets ui.state.editingCell, which mounts
// an inline <input> in a foreignObject over that cell. Selection is surface-driven
// like lines/strokes. One store mutation per committed edit (Part G6).
import { computed, ref, watch, nextTick } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { tableWidth, tableHeight } from '@/diagram/whiteboardModel.js'

const props = defineProps({
  table: { type: Object, required: true },
  selected: { type: Boolean, default: false },
})

const store = useDiagramStore()
const ui = useWhiteboardUi()

const width = computed(() => tableWidth(props.table))
const height = computed(() => tableHeight(props.table))
const rowLines = computed(() => Array.from({ length: props.table.rows - 1 }, (_, i) => i + 1))
const colLines = computed(() => Array.from({ length: props.table.cols - 1 }, (_, i) => i + 1))

// Flatten the grid into cells carrying their committed text + pixel box.
const cells = computed(() => {
  const out = []
  for (let row = 0; row < props.table.rows; row += 1) {
    for (let col = 0; col < props.table.cols; col += 1) {
      out.push({
        row,
        col,
        x: props.table.x + col * props.table.cellW,
        y: props.table.y + row * props.table.cellH,
        text: props.table.cells[`${row},${col}`] || '',
      })
    }
  }
  return out
})

// Inline editor: mounts when editingCell targets this table. The draft is held
// locally and committed on Enter/blur; Escape cancels.
const editingCell = computed(() =>
  ui.state.editingCell?.tableId === props.table.id ? ui.state.editingCell : null,
)
const draft = ref('')
const inputEl = ref(null)
watch(
  editingCell,
  (cell) => {
    if (!cell) return
    draft.value = props.table.cells[`${cell.row},${cell.col}`] || ''
    nextTick(() => inputEl.value?.focus())
  },
  { immediate: true },
)

function commitEdit() {
  const cell = editingCell.value
  if (!cell) return
  store.setTableCell(props.table.id, cell.row, cell.col, draft.value.trim())
  ui.state.editingCell = null
}
function cancelEdit() {
  ui.state.editingCell = null
}
</script>

<template>
  <g>
    <!-- Cell backgrounds + outer frame. -->
    <rect
      :x="table.x"
      :y="table.y"
      :width="width"
      :height="height"
      fill="#FFFFFF"
      :stroke="table.color"
      stroke-width="1.5"
      :style="selected ? 'filter: drop-shadow(0 0 2px #006EDB)' : null"
    />
    <line
      v-for="c in colLines"
      :key="`c${c}`"
      :x1="table.x + c * table.cellW"
      :y1="table.y"
      :x2="table.x + c * table.cellW"
      :y2="table.y + height"
      :stroke="table.color"
      stroke-width="1"
    />
    <line
      v-for="r in rowLines"
      :key="`r${r}`"
      :x1="table.x"
      :y1="table.y + r * table.cellH"
      :x2="table.x + width"
      :y2="table.y + r * table.cellH"
      :stroke="table.color"
      stroke-width="1"
    />

    <!-- Committed cell text (centered). -->
    <text
      v-for="cell in cells"
      :key="`${cell.row},${cell.col}`"
      :x="cell.x + table.cellW / 2"
      :y="cell.y + table.cellH / 2"
      text-anchor="middle"
      dominant-baseline="central"
      font-size="14"
      :fill="table.color"
      style="font-family: Inter, sans-serif; pointer-events: none"
    >
      {{ cell.text }}
    </text>

    <!-- Inline cell editor. -->
    <foreignObject
      v-if="editingCell"
      :x="table.x + editingCell.col * table.cellW"
      :y="table.y + editingCell.row * table.cellH"
      :width="table.cellW"
      :height="table.cellH"
    >
      <input
        ref="inputEl"
        v-model="draft"
        class="h-full w-full border-0 bg-transparent text-center text-sm text-ink-gray-9 outline-none"
        @pointerdown.stop
        @keydown.enter.prevent="commitEdit"
        @keydown.esc.prevent="cancelEdit"
        @blur="commitEdit"
      />
    </foreignObject>
  </g>
</template>
