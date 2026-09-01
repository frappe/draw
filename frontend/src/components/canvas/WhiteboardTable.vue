<script setup>
// One whiteboard table — a grid with per-cell text (spec diagram-types Part C9).
// Cells render as SVG; a click on an already-selected table selects the cell
// (ui.state.cellRange), a double click opens it for editing (ui.state.editingCell,
// #556 — see editTableCellAt and startTableMove), mounting an inline
// contenteditable over it — rich rather than a plain input element, so part of a
// cell can be bold (#344). Columns/rows resize
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
import {
  startCellRangeDrag,
  startTableMove,
  startTableResize,
  onColumnAutoFit as autoFitColumn,
  onRowAutoFit as autoFitRow,
} from '@/composables/useWhiteboardInteraction.js'
import { isAdditiveEvent, clientToLogical } from '@/composables/pointer.js'
import {
  tableWidth,
  tableHeight,
  tableRows,
  tableCols,
  colOffsets,
  rowOffsets,
  rowHeightsOf,
  colWidthsOf,
  cellBox,
  cellSpanBox,
  isCoveredCell,
  tableCellAt,
  tableCellStyle,
  TABLE_FONT_SIZE,
} from '@/diagram/whiteboardModel.js'
import { resolveMark } from '@/diagram/richText.js'
import { TABLE_GRID_COLOR, TABLE_HEADER_FILL, TABLE_SELECT_COLOR } from '@/diagram/whiteboardColors.js'
import { useTableCellFormat } from '@/composables/useTableCellFormat.js'
import { useTableCellEditor } from '@/composables/useTableCellEditor.js'
import {
  isHeaderRow,
  tableHeaderRows,
  isHeaderColumn,
  tableHeaderCols,
  wrappedCellRunLines,
  TABLE_LINE_HEIGHT,
} from '@/diagram/tableStructure.js'
import TableGrips from './TableGrips.vue'

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

// A subtle tinted band behind the header rows (#338), which is now the first N
// rows rather than only the first (#553).
const headerBand = computed(() => {
  const count = Math.min(tableHeaderRows(props.table), rows.value)
  if (!count) return null
  const heights = rowHeightsOf(props.table)
  const height = heights.slice(0, count).reduce((total, each) => total + each, 0)
  return { x: props.table.x, y: props.table.y, w: width.value, h: height }
})

// The same tinted band, mirrored onto the header COLUMNS (#556) — independently
// configurable from header rows.
const headerColBand = computed(() => {
  const count = Math.min(tableHeaderCols(props.table), cols.value)
  if (!count) return null
  const widths = colWidthsOf(props.table)
  const bandWidth = widths.slice(0, count).reduce((total, each) => total + each, 0)
  return { x: props.table.x, y: props.table.y, w: bandWidth, h: height.value }
})

// Horizontal text placement within a cell box, per that CELL's alignment — its own
// where it has one, else the table's (#508).
function textLayout(box, align) {
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
      const style = tableCellStyle(props.table, row, col)
      const layout = textLayout(box, style.align)
      const header = isHeaderRow(props.table, row) || isHeaderColumn(props.table, col)
      const wrappedLines = wrappedCellRunLines(props.table, row, col)
      const lineHeight = style.size * TABLE_LINE_HEIGHT
      out.push({
        row,
        col,
        box,
        // One entry per wrapped LINE, each holding one tspan per formatted run
        // within it (#344, #556 — a cell can wrap across several lines, and
        // marks still need to land on the right characters within each). A
        // header cell bolds by default; a run may override that either way.
        lines: wrappedLines.map((line) =>
          line.map((run) => ({
            text: run.text,
            weight: resolveMark(run, 'bold', header) ? 600 : 400,
            style: resolveMark(run, 'italic') ? 'italic' : null,
            // Both decorations in one attribute so they combine (#508); SVG has the
            // same single text-decoration property CSS does.
            decoration: [
              resolveMark(run, 'underline') ? 'underline' : null,
              resolveMark(run, 'strike') ? 'line-through' : null,
            ].filter(Boolean).join(' ') || null,
          })),
        ),
        header,
        tx: layout.x,
        // The whole block of lines centres in the box (#507/#556): the first
        // line's baseline sits half a block above the box's own midpoint, and
        // each following line steps down by one lineHeight (see the template's
        // dy on each line's first tspan).
        ty: box.y + box.h / 2 - ((wrappedLines.length - 1) * lineHeight) / 2,
        lineHeight,
        anchor: layout.anchor,
        color: style.color,
        size: style.size,
        font: style.font,
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
// Double-clicking the same handle fits the column/row to its content instead
// of dragging it (#12). `.stop` on the template's @dblclick keeps this from
// also reaching the canvas's own double-click handler, which would otherwise
// open a cell editor right after (editTableCellAt resolves by canvas point,
// and a resize handle sits exactly on a cell boundary).
function onColumnAutoFit(col) {
  autoFitColumn(store, props.table, col)
}
function onRowAutoFit(row) {
  autoFitRow(store, props.table, row)
}

// The cell under a pointer event, in table coordinates.
function cellAtEvent(event) {
  return tableCellAt(props.table, pointAtEvent(event))
}

// The table is the ONLY thing selected. The grips act on one table's rows and
// columns, so they have no meaning while a multi-selection is being moved as a
// unit — and useTableSelection resolves its table from the lone selection, so
// showing them then would show controls that resolve to nothing.
const isLoneSelection = computed(
  () => props.selected && (ui.state.selection || []).length === 1,
)

// A press on the table (select tool only). The first press and additive toggles
// fall through to the surface selectAt; once it's selected WE own the press — a
// shift-click extends a cell range, a drag across the cells selects a range
// (#553), a drag on the frame band moves the table, and a plain click selects
// the cell under it (#556) without opening it for editing.
function onPointerDown(event) {
  if (event.button !== 0 || editorUi.state.tool !== 'select') return
  const lone = isLoneSelection.value
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
  const point = pointAtEvent(event)
  // The frame band moves the table (with everything co-selected); so does any
  // press while the table is part of a multi-selection. Inside the cells of a
  // lone table, a drag selects a cell range and a plain click selects the one
  // cell under it (#553, #556) — the two gestures cannot both be "drag inside
  // the grid".
  if (!lone || event.target.hasAttribute('data-table-frame')) {
    startTableMove(event, store, editorUi, ui, props.table, point)
    return
  }
  startCellRangeDrag(event, store, editorUi, ui, props.table, point)
}

// The press position in canvas units.
function pointAtEvent(event) {
  const surface = event.target.closest('[data-fdpreset]')
  const rect = surface ? surface.getBoundingClientRect() : { left: 0, top: 0 }
  return clientToLogical(event, rect, editorUi.viewport)
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
// The cell open for editing, and its box.
const editingCell = computed(() =>
  ui.state.editingCell?.tableId === props.table.id ? ui.state.editingCell : null,
)
const editBox = computed(() =>
  editingCell.value ? cellSpanBox(props.table, editingCell.value.row, editingCell.value.col) : null,
)

// Any active range is highlighted while the table is selected and nothing in it
// is being edited (#556: a plain click selects, it no longer opens the editor,
// so even a lone plain cell needs this highlight now). editBox draws its own
// highlight while editing, so the two never overlap.
const showRange = computed(() => props.selected && !!range.value && !editingCell.value)

// Deselecting the table drops any pending cell range.
watch(
  () => props.selected,
  (isSelected) => {
    if (!isSelected && range.value) ui.state.cellRange = null
  },
)

// Inline editor: mounts when editingCell targets this table. Edits are held in
// the editor element and committed on Enter or click-away; Escape cancels.


// The editor and the committed <text> read their type from ONE place (#507), and
// that place is now the model (#508): a cell can carry its own colour, alignment and
// size, falling back to the table's. They used to be stated twice — `font-size="14"`
// against `text-sm`, and `table.color` against `text-ink-gray-9` — so a cell was
// typed in near-black and committed in the table's colour.
const editingStyle = computed(() =>
  editingCell.value
    ? tableCellStyle(props.table, editingCell.value.row, editingCell.value.col)
    : null,
)

// Vertical centring for a contenteditable, done with line-height rather than
// `items-center` (#507). An EMPTY cell has no text node, so a flex box has no item
// to centre and the caret dropped to the top of the box — then jumped to the middle
// as soon as the first character created one. A full-height line box centres the
// caret whether or not anything has been typed — and still does here for the
// common ONE-line case (#556: cells wrap now, but most stay one line).
//
// A line-height spanning the whole box only works for exactly one line — two
// lines at "box height" each would together be twice the box's own height. So
// once a cell has actually wrapped past one line (lineCount from
// useTableCellEditor, live as it's typed into), this switches to a normal
// per-line value and lets the block simply start at the top of its now-taller
// row, rather than trying to keep every line individually centred.
const editorStyle = computed(() => ({
  fontSize: `${editingStyle.value?.size || TABLE_FONT_SIZE}px`,
  lineHeight:
    lineCount.value > 1
      ? String(TABLE_LINE_HEIGHT)
      : editBox.value
        ? `${editBox.value.h}px`
        : undefined,
  color: editingStyle.value?.color,
  textAlign: editingStyle.value?.align,
  fontFamily: editingStyle.value?.font || 'Inter, sans-serif',
}))
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
const { onEditorKeydown, onPasteText, onEditorInput, lineCount } = useTableCellEditor({
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
      :stroke="TABLE_GRID_COLOR"
      stroke-width="1.5"
      :style="selected ? `filter: drop-shadow(0 0 2px ${TABLE_SELECT_COLOR})` : null"
    />

    <!-- Header band: a subtle tint behind the first row so it reads apart (#338). -->
    <rect
      v-if="headerBand"
      :x="headerBand.x"
      :y="headerBand.y"
      :width="headerBand.w"
      :height="headerBand.h"
      :fill="TABLE_HEADER_FILL"
      style="pointer-events: none"
    />

    <!-- Same tint, mirrored onto the header columns (#556) — independent of the
         header row band, so both can be on at once. -->
    <rect
      v-if="headerColBand"
      :x="headerColBand.x"
      :y="headerColBand.y"
      :width="headerColBand.w"
      :height="headerColBand.h"
      :fill="TABLE_HEADER_FILL"
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
      :stroke="TABLE_GRID_COLOR"
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
      :fill="TABLE_SELECT_COLOR"
      fill-opacity="0.08"
      :stroke="TABLE_SELECT_COLOR"
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
      :fill="TABLE_SELECT_COLOR"
      fill-opacity="0.08"
      :stroke="TABLE_SELECT_COLOR"
      stroke-width="1.5"
      style="pointer-events: none"
    />

    <!-- Committed cell text: aligned per table.align, wrapped into as many
         lines as the column width forces, one tspan per formatted run within
         each line (#344, #556). The header row/column is bold unless a run
         says otherwise. Only the FIRST tspan of a line carries x/dy — that is
         what resets the horizontal cursor and steps down a line; a run
         continuing the same line carries neither, so it picks up right where
         the previous one left off. -->
    <text
      v-for="cell in cellNodes"
      v-show="!isCellEditing(cell)"
      :key="`t${cell.row},${cell.col}`"
      :y="cell.ty"
      :text-anchor="cell.anchor"
      dominant-baseline="central"
      :font-size="cell.size"
      :fill="cell.color"
      :style="{ fontFamily: cell.font, pointerEvents: 'none' }"
    ><template v-for="(line, lineIndex) in cell.lines" :key="lineIndex"><tspan
        v-for="(span, spanIndex) in line"
        :key="spanIndex"
        :x="spanIndex === 0 ? cell.tx : undefined"
        :dy="spanIndex === 0 ? (lineIndex === 0 ? 0 : cell.lineHeight) : undefined"
        :font-weight="span.weight"
        :font-style="span.style"
        :text-decoration="span.decoration"
      >{{ span.text }}</tspan></template></text>

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
        class="h-full w-full whitespace-pre-wrap break-words border-0 bg-transparent px-3 outline-none"
        :class="isHeaderRow(table, editingCell.row) || isHeaderColumn(table, editingCell.col) ? 'font-semibold' : ''"
        :style="editorStyle"
        @pointerdown.stop
        @keydown="onEditorKeydown"
        @keyup="refreshActiveMarks"
        @mouseup="refreshActiveMarks"
        @input="onEditorInput"
        @paste.prevent="onPasteText($event.clipboardData?.getData('text/plain'))"
        @drop.prevent="onPasteText($event.dataTransfer?.getData('text/plain'))"
      />
    </foreignObject>

    <!-- Row / column grips + the move band, only while the table is selected. -->
    <TableGrips v-if="isLoneSelection" :table="table" />

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
        @dblclick.stop="onColumnAutoFit(handle.col)"
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
        @dblclick.stop="onRowAutoFit(handle.row)"
      />
    </template>
  </g>
</template>
