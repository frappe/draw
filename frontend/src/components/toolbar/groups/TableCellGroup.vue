<script setup>
// Table cell controls (#363): per-cell bold / italic / underline (#344), and
// merge / split for a dragged range (#338).
//
// These are keyed to a cell or a range rather than to a selected object, so the
// group self-gates on `editingCell` / `cellRange` instead of on the whiteboard
// selection.
//
// It reads shared state directly rather than taking props. The bar this replaces
// had to live outside WhiteboardTable for the same reason: that component's root
// is an SVG <g>, and a Teleport created inside an SVG subtree produces an
// SVG-namespaced div with no layout box — present, zero-sized and unclickable
// (#356). Nothing here should ever be rendered from inside the table again.
import { computed, watch } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { useTableCellFormat } from '@/composables/useTableCellFormat.js'
import { mergeCovering, tableById, tableCellStyle, TABLE_FONT_SIZE } from '@/diagram/whiteboardModel.js'
import { useTableSelection } from '@/composables/useTableSelection.js'
import { Select } from 'frappe-ui'
import { FONTS } from '@/diagram/textFonts.js'
import ToolbarButton from '../ToolbarButton.vue'
import ToolbarSeparator from '../ToolbarSeparator.vue'

// The same four marks a text box offers (#508). Strikethrough was the one missing:
// cells already stored runs, so it needed a mark rather than a model change.
const FORMAT_OPTIONS = [
  { mark: 'bold', label: 'Bold', icon: 'lucide-bold' },
  { mark: 'italic', label: 'Italic', icon: 'lucide-italic' },
  { mark: 'underline', label: 'Underline', icon: 'lucide-underline' },
  { mark: 'strike', label: 'Strikethrough', icon: 'lucide-strikethrough' },
]

const ALIGNMENTS = [
  { value: 'left', label: 'Align left', icon: 'lucide-text-align-start' },
  { value: 'center', label: 'Align center', icon: 'lucide-text-align-center' },
  { value: 'right', label: 'Align right', icon: 'lucide-text-align-end' },
]

const store = useDiagramStore()
const ui = useWhiteboardUi()

const tableId = computed(() => ui.state.editingCell?.tableId || ui.state.cellRange?.tableId || null)
const table = computed(() =>
  tableId.value ? tableById(store.state.whiteboard || {}, tableId.value) : null,
)
const editingCell = computed(() => (table.value ? ui.state.editingCell : null))
const range = computed(() => (table.value ? ui.state.cellRange : null))

const { activeMarks, toggleMark, refreshActiveMarks } = useTableCellFormat({
  table: () => table.value,
  store,
  editingCell,
  editorEl: ui.cellEditor,
  range,
})

// Structural edits (insert/delete row & column, header toggles, the Table
// actions menu) moved to WhiteboardObjectGroup's combined "Table" control
// (#556) — it has to work whether or not a cell is picked, this group only
// shows once one is. useTableSelection is still read here for the cells a
// format change applies to.
const selection = useTableSelection()

const canMerge = computed(
  () => !!range.value && (range.value.r0 !== range.value.r1 || range.value.c0 !== range.value.c1),
)
const canSplit = computed(
  () =>
    !!range.value &&
    range.value.r0 === range.value.r1 &&
    range.value.c0 === range.value.c1 &&
    !!mergeCovering(table.value, range.value.r0, range.value.c0),
)
// Any picked cell brings the bar up now, not only an open editor or a mergeable
// range: selecting a row and formatting it is the whole point of #553.
const show = computed(() => !!table.value && (!!editingCell.value || selection.hasSelection.value))

// A new target — another cell opened, or a different range — makes the buttons
// re-read what it carries.
watch([editingCell, range], refreshActiveMarks, { immediate: true })

function doMerge() {
  const selected = range.value
  store.mergeTableCells(table.value.id, selected.r0, selected.c0, selected.r1, selected.c1)
  ui.state.cellRange = null
}

function doSplit() {
  store.unmergeTableCell(table.value.id, range.value.r0, range.value.c0)
  ui.state.cellRange = null
}

// The cells a style change applies to: the open cell, else every cell of a dragged
// range. Colour, alignment and size are per CELL now, with the table's own value as
// the default an untouched cell follows (#508).
const styledCells = computed(() => {
  if (editingCell.value) return [{ row: editingCell.value.row, col: editingCell.value.col }]
  const selected = range.value
  if (!selected) return []
  const cells = []
  for (let row = Math.min(selected.r0, selected.r1); row <= Math.max(selected.r0, selected.r1); row += 1) {
    for (let col = Math.min(selected.c0, selected.c1); col <= Math.max(selected.c0, selected.c1); col += 1) {
      cells.push({ row, col })
    }
  }
  return cells
})

// What the controls READ: the first targeted cell, so the bar shows a real value
// rather than the table's when a cell has been given its own.
const current = computed(() => {
  const first = styledCells.value[0]
  return first ? tableCellStyle(table.value, first.row, first.col) : null
})

function setCellStyle(patch) {
  if (styledCells.value.length) store.setTableCellStyle(table.value.id, styledCells.value, patch)
}

function stepFontSize(delta) {
  const size = Math.max(6, Math.min(200, (current.value?.size || TABLE_FONT_SIZE) + delta))
  setCellStyle({ size })
}

function setFont(value) {
  setCellStyle({ font: value })
}
</script>

<template>
  <template v-if="show">
    <!-- Font, size, alignment are per CELL, with the table's own value as the
         default an untouched cell follows (#508). They act on the open cell, or on
         every cell of a dragged range. -->
    <template v-if="current">
      <Select :model-value="current.font" :options="FONTS" class="h-7 w-[92px]" @update:model-value="setFont" @mousedown.stop />

      <div class="flex items-center rounded-md border border-outline-gray-2">
        <ToolbarButton class="!w-6" label="Decrease cell font size" icon="lucide-minus" @click="stepFontSize(-1)" />
        <span class="w-6 text-center text-sm tabular-nums text-ink-gray-8">{{ current.size }}</span>
        <ToolbarButton class="!w-6" label="Increase cell font size" icon="lucide-plus" @click="stepFontSize(1)" />
      </div>
    </template>

    <ToolbarButton
      v-for="option in FORMAT_OPTIONS"
      :key="option.mark"
      :label="option.label"
      :icon="option.icon"
      :active="activeMarks[option.mark] === true"
      @click="toggleMark(option.mark)"
    />

    <template v-if="current">
      <ToolbarButton
        v-for="option in ALIGNMENTS"
        :key="option.value"
        :label="option.label"
        :icon="option.icon"
        :active="current.align === option.value"
        @click="setCellStyle({ align: option.value })"
      />
    </template>

    <template v-if="canMerge || canSplit">
      <ToolbarSeparator />
      <ToolbarButton v-if="canMerge" label="Merge cells" icon="lucide-table-cells-merge" @click="doMerge" />
      <ToolbarButton v-if="canSplit" label="Split cell" icon="lucide-table-cells-split" @click="doSplit" />
    </template>
  </template>
</template>
