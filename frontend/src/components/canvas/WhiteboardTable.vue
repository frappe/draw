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
// The cell `draft` currently belongs to. We commit against THIS, not
// editingCell.value, because switching cells (the T2 single-click path) reuses
// the same <input> and advances editingCell synchronously — so a commit keyed on
// editingCell.value would write to the wrong cell (or lose the text entirely).
const draftCell = ref(null)
const cancelling = ref(false)
const inputEl = ref(null)

// The editingCell watch is the single commit point. On every transition — cell
// A → cell B, or → null (Enter/click-away) — flush the outgoing cell's draft
// (unless Escape cancelled it), then load the incoming cell. No @blur handler:
// it raced with the reused <input> and double-committed to the wrong cell.
watch(
  editingCell,
  (cell) => {
    if (draftCell.value && !cancelling.value) {
      const prev = draftCell.value
      const committed = props.table.cells[`${prev.row},${prev.col}`] || ''
      // Only write when the text actually changed — moving the caret between
      // cells without typing must not push an empty "Edit cell" undo step.
      if (draft.value.trim() !== committed) {
        store.setTableCell(props.table.id, prev.row, prev.col, draft.value.trim())
      }
    }
    cancelling.value = false
    if (!cell) {
      draftCell.value = null
      return
    }
    draft.value = props.table.cells[`${cell.row},${cell.col}`] || ''
    draftCell.value = { row: cell.row, col: cell.col }
    nextTick(() => inputEl.value?.focus())
  },
  { immediate: true },
)

function commitEdit() {
  ui.state.editingCell = null // the watch flushes draftCell for us
}
function cancelEdit() {
  cancelling.value = true // tell the watch to discard, not commit
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

    <!-- Active cell highlight so the selected/editing cell reads clearly (T2). -->
    <rect
      v-if="editingCell"
      :x="table.x + editingCell.col * table.cellW"
      :y="table.y + editingCell.row * table.cellH"
      :width="table.cellW"
      :height="table.cellH"
      fill="#006EDB"
      fill-opacity="0.08"
      stroke="#006EDB"
      stroke-width="1.5"
      style="pointer-events: none"
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
      />
    </foreignObject>
  </g>
</template>
