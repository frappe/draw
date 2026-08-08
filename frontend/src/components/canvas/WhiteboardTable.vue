<script setup>
// One whiteboard table — a grid with per-cell text (spec diagram-types Part C9).
// The grid + committed cell text render as SVG; double-clicking a cell (handled by
// the surface onDoubleClick) sets ui.state.editingCell, which mounts an inline
// <input> in a foreignObject over that cell. Columns/rows can be resized by
// dragging their edges when the table is selected (#338). Selection is
// surface-driven like lines/strokes. One store mutation per committed edit (G6).
import { computed, ref, watch, nextTick } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { startTableMove, startTableResize } from '@/composables/useWhiteboardInteraction.js'
import { isAdditiveEvent, clientToLogical } from '@/composables/pointer.js'
import {
  tableWidth,
  tableHeight,
  tableRows,
  tableCols,
  colOffsets,
  rowOffsets,
  rowHeightsOf,
  cellBox,
} from '@/diagram/whiteboardModel.js'

const props = defineProps({
  table: { type: Object, required: true },
  selected: { type: Boolean, default: false },
})

const store = useDiagramStore()
const editorUi = useEditorUi()
const ui = useWhiteboardUi()

const width = computed(() => tableWidth(props.table))
const height = computed(() => tableHeight(props.table))
// Counts are clamped in whiteboardModel so an untrusted document can't drive an
// unbounded render loop — every loop below reads these, not the raw table fields.
const rows = computed(() => tableRows(props.table))
const cols = computed(() => tableCols(props.table))

// Internal gridline positions — the shared edges between columns / rows.
const colGridlines = computed(() =>
  colOffsets(props.table).slice(1, -1).map((offset) => props.table.x + offset),
)
const rowGridlines = computed(() =>
  rowOffsets(props.table).slice(1, -1).map((offset) => props.table.y + offset),
)

// Resize handles: each column's right edge / each row's bottom edge (incl. the
// outer ones), mapped to the 0-based column / row that edge resizes.
const colHandles = computed(() =>
  colOffsets(props.table).slice(1).map((offset, col) => ({ col, x: props.table.x + offset })),
)
const rowHandles = computed(() =>
  rowOffsets(props.table).slice(1).map((offset, row) => ({ row, y: props.table.y + offset })),
)

// A subtle tinted band behind the first row when it is a header (#338).
const headerBand = computed(() =>
  props.table.hasHeader && rows.value > 0
    ? { x: props.table.x, y: props.table.y, w: width.value, h: rowHeightsOf(props.table)[0] }
    : null,
)

// Horizontal text placement within a cell box, per the table's align setting.
function textLayout(box) {
  const align = props.table.align || 'left'
  if (align === 'center') return { x: box.x + box.w / 2, anchor: 'middle' }
  if (align === 'right') return { x: box.x + box.w - 12, anchor: 'end' }
  return { x: box.x + 12, anchor: 'start' }
}

// Flatten the grid into cells carrying their committed text + placement.
const cellNodes = computed(() => {
  const out = []
  for (let row = 0; row < rows.value; row += 1) {
    for (let col = 0; col < cols.value; col += 1) {
      const box = cellBox(props.table, row, col)
      const layout = textLayout(box)
      out.push({
        row,
        col,
        text: props.table.cells[`${row},${col}`] || '',
        header: props.table.hasHeader && row === 0,
        tx: layout.x,
        ty: box.y + box.h / 2,
        anchor: layout.anchor,
      })
    }
  }
  return out
})

function onColumnResize(event, col) {
  startTableResize(event, store, editorUi, props.table, 'col', col)
}
function onRowResize(event, row) {
  startTableResize(event, store, editorUi, props.table, 'row', row)
}

// A press on the table (select tool only). The first press and additive toggles
// fall through to the surface selectAt, which single-selects/toggles the table;
// once it's selected WE own the press — a drag past a small threshold moves it, a
// plain click drops the caret into the cell under it (T2) — so the surface never
// double-handles it (#133). Mirrors the sticky-note pointerdown.
function onPointerDown(event) {
  if (event.button !== 0 || editorUi.state.tool !== 'select') return
  if (isAdditiveEvent(event) || !ui.isSelected('table', props.table.id)) return
  event.stopPropagation()
  const surface = event.target.closest('[data-fdpreset]')
  const rect = surface ? surface.getBoundingClientRect() : { left: 0, top: 0 }
  startTableMove(event, store, editorUi, ui, props.table, clientToLogical(event, rect, editorUi.viewport))
}

// Inline editor: mounts when editingCell targets this table. The draft is held
// locally and committed on Enter/blur; Escape cancels.
const editingCell = computed(() =>
  ui.state.editingCell?.tableId === props.table.id ? ui.state.editingCell : null,
)
const editBox = computed(() =>
  editingCell.value ? cellBox(props.table, editingCell.value.row, editingCell.value.col) : null,
)
const inputAlignClass = computed(
  () => ({ left: 'text-left', center: 'text-center', right: 'text-right' })[props.table.align] || 'text-left',
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
  <g @pointerdown="onPointerDown">
    <!-- Paper + outer frame (the frame carries the chosen colour). -->
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

    <!-- Header band: a subtle tint behind the first row so it reads apart (#338). -->
    <rect
      v-if="headerBand"
      :x="headerBand.x"
      :y="headerBand.y"
      :width="headerBand.w"
      :height="headerBand.h"
      fill="#F4F4F6"
      style="pointer-events: none"
    />

    <!-- Internal grid: light neutral, so the content leads rather than the lines. -->
    <line
      v-for="(x, i) in colGridlines"
      :key="`c${i}`"
      :x1="x"
      :y1="table.y"
      :x2="x"
      :y2="table.y + height"
      stroke="#E6E6EA"
      stroke-width="1"
    />
    <line
      v-for="(y, i) in rowGridlines"
      :key="`r${i}`"
      :x1="table.x"
      :y1="y"
      :x2="table.x + width"
      :y2="y"
      stroke="#E6E6EA"
      stroke-width="1"
    />

    <!-- Active cell highlight so the selected/editing cell reads clearly (T2). -->
    <rect
      v-if="editBox"
      :x="editBox.x"
      :y="editBox.y"
      :width="editBox.w"
      :height="editBox.h"
      fill="#006EDB"
      fill-opacity="0.08"
      stroke="#006EDB"
      stroke-width="1.5"
      style="pointer-events: none"
    />

    <!-- Committed cell text: aligned per table.align; the header row is bold. -->
    <text
      v-for="cell in cellNodes"
      :key="`${cell.row},${cell.col}`"
      :x="cell.tx"
      :y="cell.ty"
      :text-anchor="cell.anchor"
      dominant-baseline="central"
      font-size="14"
      :font-weight="cell.header ? 600 : 400"
      :fill="table.color"
      style="font-family: Inter, sans-serif; pointer-events: none"
    >
      {{ cell.text }}
    </text>

    <!-- Inline cell editor (aligned + padded to match the committed text). -->
    <foreignObject
      v-if="editBox"
      :x="editBox.x"
      :y="editBox.y"
      :width="editBox.w"
      :height="editBox.h"
    >
      <input
        ref="inputEl"
        v-model="draft"
        class="h-full w-full border-0 bg-transparent px-3 text-sm text-ink-gray-9 outline-none"
        :class="[inputAlignClass, table.hasHeader && editingCell.row === 0 ? 'font-semibold' : '']"
        @pointerdown.stop
        @keydown.enter.prevent="commitEdit"
        @keydown.esc.prevent="cancelEdit"
      />
    </foreignObject>

    <!-- Resize handles: thin drag zones on each column/row edge, only when the
         table is selected so they never fight normal moving/editing. -->
    <template v-if="selected">
      <rect
        v-for="handle in colHandles"
        :key="`ch${handle.col}`"
        :x="handle.x - 3"
        :y="table.y"
        width="6"
        :height="height"
        fill="transparent"
        style="cursor: col-resize"
        @pointerdown.stop.prevent="onColumnResize($event, handle.col)"
      />
      <rect
        v-for="handle in rowHandles"
        :key="`rh${handle.row}`"
        :x="table.x"
        :y="handle.y - 3"
        :width="width"
        height="6"
        fill="transparent"
        style="cursor: row-resize"
        @pointerdown.stop.prevent="onRowResize($event, handle.row)"
      />
    </template>
  </g>
</template>
