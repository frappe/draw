<script setup>
// One whiteboard table — a grid with per-cell text (spec diagram-types Part C9).
// Cells render as SVG; double-clicking one, or clicking one on an already-
// selected table, sets ui.state.editingCell (see editTableCellAt and
// startTableMove), mounting an inline contenteditable over it — rich rather
// than a plain <input>, so part of a cell can be bold (#344). Columns/rows resize
// by dragging their edges when selected, and a shift-click cell range can be
// merged / split (#338). Selection is surface-driven like lines/strokes. One
// store mutation per committed edit (Part G6).
//
// The B / I / U and Merge / Split control is NOT here: this component's root is
// an SVG <g>, and Vue builds a <Teleport>'s content in the surrounding namespace,
// so a toolbar created here is an SVG-namespaced <div> with no layout box. It
// lives in floating/TableCellToolbar, driven by shared useWhiteboardUi state.
import { computed, watch } from 'vue'
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
  cellSpanBox,
  isCoveredCell,
  mergeCovering,
  tableCellAt,
  tableCellRuns,
} from '@/diagram/whiteboardModel.js'
import { resolveMark } from '@/diagram/richText.js'
import { useTableCellFormat } from '@/composables/useTableCellFormat.js'
import { useTableCellEditor } from '@/composables/useTableCellEditor.js'

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

// The visible cells: covered (non-anchor) cells are skipped, and a merge anchor
// carries the box spanning its whole rectangle. Each draws its own border rect,
// so merges break the grid without any gridline bookkeeping.
const cellNodes = computed(() => {
  const out = []
  for (let row = 0; row < rows.value; row += 1) {
    for (let col = 0; col < cols.value; col += 1) {
      if (isCoveredCell(props.table, row, col)) continue
      const box = cellSpanBox(props.table, row, col)
      const layout = textLayout(box)
      const header = props.table.hasHeader && row === 0
      out.push({
        row,
        col,
        box,
        // One tspan per run so per-cell formatting renders (#344). A header cell
        // bolds by default; a run may override that either way.
        spans: tableCellRuns(props.table, row, col).map((run) => ({
          text: run.text,
          weight: resolveMark(run, 'bold', header) ? 600 : 400,
          style: resolveMark(run, 'italic') ? 'italic' : null,
          decoration: resolveMark(run, 'underline') ? 'underline' : null,
        })),
        header,
        tx: layout.x,
        ty: box.y + box.h / 2,
        anchor: layout.anchor,
      })
    }
  }
  return out
})

// The open cell's committed text is not drawn: the editor sits over it with a
// transparent background, so both would render and read as doubled text.
function isCellEditing(cell) {
  return editingCell.value?.row === cell.row && editingCell.value?.col === cell.col
}

function onColumnResize(event, col) {
  startTableResize(event, store, editorUi, props.table, 'col', col)
}
function onRowResize(event, row) {
  startTableResize(event, store, editorUi, props.table, 'row', row)
}

// The cell under a pointer event, in table coordinates.
function cellAtEvent(event) {
  const surface = event.target.closest('[data-fdpreset]')
  const rect = surface ? surface.getBoundingClientRect() : { left: 0, top: 0 }
  return tableCellAt(props.table, clientToLogical(event, rect, editorUi.viewport))
}

// A press on the table (select tool only). The first press and additive toggles
// fall through to the surface selectAt; once it's selected WE own the press — a
// shift-click extends a cell range for merge, a drag past a threshold moves it,
// and a plain click drops the caret into the cell (T2). Mirrors the sticky note.
function onPointerDown(event) {
  if (event.button !== 0 || editorUi.state.tool !== 'select') return
  const lone = ui.isSelected('table', props.table.id) && (ui.state.selection || []).length === 1
  // Shift-click on the lone-selected table grows a cell range for merge (#338).
  if (event.shiftKey && lone) {
    const cell = cellAtEvent(event)
    if (cell) {
      event.stopPropagation()
      const anchor = range.value ? { row: range.value.r0, col: range.value.c0 } : cell
      ui.state.cellRange = {
        tableId: props.table.id,
        r0: anchor.row,
        c0: anchor.col,
        r1: cell.row,
        c1: cell.col,
      }
      ui.state.editingCell = null
      return
    }
  }
  if (isAdditiveEvent(event) || !ui.isSelected('table', props.table.id)) return
  event.stopPropagation()
  // Plain press: remember the single cell (so Split can offer itself for a merged
  // cell), then run the move / click-to-edit gesture.
  const cell = cellAtEvent(event)
  if (cell) {
    ui.state.cellRange = { tableId: props.table.id, r0: cell.row, c0: cell.col, r1: cell.row, c1: cell.col }
  }
  const surface = event.target.closest('[data-fdpreset]')
  const rect = surface ? surface.getBoundingClientRect() : { left: 0, top: 0 }
  startTableMove(event, store, editorUi, ui, props.table, clientToLogical(event, rect, editorUi.viewport))
}

// ----- merge / split -----
const range = computed(() =>
  ui.state.cellRange?.tableId === props.table.id ? ui.state.cellRange : null,
)
const rangeBox = computed(() => {
  if (!range.value) return null
  const r = range.value
  const a = cellBox(props.table, Math.min(r.r0, r.r1), Math.min(r.c0, r.c1))
  const b = cellBox(props.table, Math.max(r.r0, r.r1), Math.max(r.c0, r.c1))
  return { x: a.x, y: a.y, w: b.x + b.w - a.x, h: b.y + b.h - a.y }
})
const canMerge = computed(
  () => !!range.value && (range.value.r0 !== range.value.r1 || range.value.c0 !== range.value.c1),
)
const canSplit = computed(
  () =>
    !!range.value &&
    range.value.r0 === range.value.r1 &&
    range.value.c0 === range.value.c1 &&
    !!mergeCovering(props.table, range.value.r0, range.value.c0),
)
// The cell open for editing, and its box.
const editingCell = computed(() =>
  ui.state.editingCell?.tableId === props.table.id ? ui.state.editingCell : null,
)
const editBox = computed(() =>
  editingCell.value ? cellSpanBox(props.table, editingCell.value.row, editingCell.value.col) : null,
)

const showRange = computed(() => props.selected && !!range.value && (canMerge.value || canSplit.value))

// Deselecting the table drops any pending cell range.
watch(
  () => props.selected,
  (isSelected) => {
    if (!isSelected && range.value) ui.state.cellRange = null
  },
)

// Inline editor: mounts when editingCell targets this table. Edits are held in
// the editor element and committed on Enter or click-away; Escape cancels.
const inputAlignClass = computed(
  () => ({ left: 'text-left', center: 'text-center', right: 'text-right' })[props.table.align] || 'text-left',
)
// Published on the shared UI store so the cell's B / I / U control — which has to
// render from the HTML tree, see TableCellToolbar — can act on this editor's
// current text selection.
const editorEl = ui.cellEditor

const { toggleMark, refreshActiveMarks } = useTableCellFormat({
  table: () => props.table,
  store,
  editingCell,
  editorEl,
  range,
})
const { onEditorKeydown, onPasteText } = useTableCellEditor({
  table: () => props.table,
  store,
  editingCell,
  editorEl,
  refreshActiveMarks,
  toggleMark,
  closeEditor: () => {
    ui.state.editingCell = null
  },
})

// A new cell range needs the B / I / U buttons to re-read what it carries.
watch(range, refreshActiveMarks)
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

    <!-- One border rect per visible cell (a merge anchor spans its rectangle), so
         the light-neutral grid naturally breaks around merged cells. -->
    <rect
      v-for="cell in cellNodes"
      :key="`b${cell.row},${cell.col}`"
      :x="cell.box.x"
      :y="cell.box.y"
      :width="cell.box.w"
      :height="cell.box.h"
      fill="none"
      stroke="#E6E6EA"
      stroke-width="1"
      style="pointer-events: none"
    />

    <!-- Shift-click cell range highlight (merge / split target). -->
    <rect
      v-if="showRange && rangeBox"
      :x="rangeBox.x"
      :y="rangeBox.y"
      :width="rangeBox.w"
      :height="rangeBox.h"
      fill="#006EDB"
      fill-opacity="0.08"
      stroke="#006EDB"
      stroke-width="1.5"
      style="pointer-events: none"
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

    <!-- Committed cell text: aligned per table.align, one tspan per formatted
         run. The header row is bold unless a run says otherwise (#344). -->
    <text
      v-for="cell in cellNodes"
      v-show="!isCellEditing(cell)"
      :key="`t${cell.row},${cell.col}`"
      :x="cell.tx"
      :y="cell.ty"
      :text-anchor="cell.anchor"
      dominant-baseline="central"
      font-size="14"
      :fill="table.color"
      style="font-family: Inter, sans-serif; pointer-events: none"
    ><tspan
        v-for="(span, index) in cell.spans"
        :key="index"
        :font-weight="span.weight"
        :font-style="span.style"
        :text-decoration="span.decoration"
      >{{ span.text }}</tspan></text>

    <!-- Inline cell editor (aligned + padded to match the committed text). -->
    <foreignObject
      v-if="editBox"
      :x="editBox.x"
      :y="editBox.y"
      :width="editBox.w"
      :height="editBox.h"
    >
      <div
        ref="editorEl"
        contenteditable="true"
        role="textbox"
        aria-label="Cell text"
        class="flex h-full w-full items-center overflow-x-auto whitespace-nowrap border-0 bg-transparent px-3 text-sm text-ink-gray-9 outline-none"
        :class="[inputAlignClass, table.hasHeader && editingCell.row === 0 ? 'font-semibold' : '']"
        @pointerdown.stop
        @keydown="onEditorKeydown"
        @keyup="refreshActiveMarks"
        @mouseup="refreshActiveMarks"
        @paste.prevent="onPasteText($event.clipboardData?.getData('text/plain'))"
        @drop.prevent="onPasteText($event.dataTransfer?.getData('text/plain'))"
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
