<script setup>
// The floating control for a table cell: bold / italic / underline (#344) and
// Merge / Split (#338), anchored above the cell range or the open cell.
//
// It lives HERE, in the HTML tree, rather than inside WhiteboardTable — that
// component's root is an SVG <g>, and Vue creates a <Teleport>'s content in the
// surrounding namespace, so a toolbar built there is an SVG-namespaced <div>
// with no layout box: present in the DOM, zero-sized, unclickable. Everything it
// needs is already shared state (useWhiteboardUi holds editingCell, cellRange
// and the live cell editor), so nothing is threaded through props.
import { computed, watch } from 'vue'
import { Button, Divider } from 'frappe-ui'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { useCanvasToolbarStyle } from '@/composables/useCanvasToolbarStyle.js'
import { useTableCellFormat } from '@/composables/useTableCellFormat.js'
import { cellBox, cellSpanBox, mergeCovering, tableById } from '@/diagram/whiteboardModel.js'

const FORMAT_OPTIONS = [
  { mark: 'bold', label: 'Bold', icon: 'lucide-bold' },
  { mark: 'italic', label: 'Italic', icon: 'lucide-italic' },
  { mark: 'underline', label: 'Underline', icon: 'lucide-underline' },
]

const store = useDiagramStore()
const ui = useWhiteboardUi()

// The table the open cell or the cell range belongs to.
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
// Shown while a cell is open for editing, or when a range offers merge/split.
const show = computed(() => !!table.value && (!!editingCell.value || canMerge.value || canSplit.value))

// Anchored to the cell range, falling back to the open cell — a range is not set
// on every path that opens a cell.
const box = computed(() => {
  if (range.value) {
    const r = range.value
    const a = cellBox(table.value, Math.min(r.r0, r.r1), Math.min(r.c0, r.c1))
    const b = cellBox(table.value, Math.max(r.r0, r.r1), Math.max(r.c0, r.c1))
    return { x: a.x, y: a.y, w: b.x + b.w - a.x, h: b.y + b.h - a.y }
  }
  if (editingCell.value) return cellSpanBox(table.value, editingCell.value.row, editingCell.value.col)
  return null
})
const style = useCanvasToolbarStyle(box)

// A new target — another cell opened, or a different range — makes the buttons
// re-read what it carries.
watch([editingCell, range], refreshActiveMarks, { immediate: true })

function doMerge() {
  const r = range.value
  store.mergeTableCells(table.value.id, r.r0, r.c0, r.r1, r.c1)
  ui.state.cellRange = null
}
function doSplit() {
  store.unmergeTableCell(table.value.id, range.value.r0, range.value.c0)
  ui.state.cellRange = null
}
</script>

<template>
  <Teleport to="body">
    <!-- mousedown.prevent keeps focus in the cell editor, so a click acts on the
         words that are still selected there. -->
    <div
      v-if="show && box"
      data-table-cell-toolbar
      class="fixed z-30 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-lg border border-outline-gray-2 bg-surface-base p-1 shadow-lg"
      :style="style"
      @pointerenter="refreshActiveMarks"
    >
      <Button
        v-for="option in FORMAT_OPTIONS"
        :key="option.mark"
        :variant="activeMarks[option.mark] === true ? 'subtle' : 'ghost'"
        theme="gray"
        size="sm"
        :icon="option.icon"
        :tooltip="option.label"
        :label="option.label"
        @mousedown.prevent
        @click="toggleMark(option.mark)"
      />
      <Divider v-if="canMerge || canSplit" class="!h-5" orientation="vertical" />
      <Button
        v-if="canMerge"
        variant="ghost"
        theme="gray"
        size="sm"
        icon-left="lucide-table-cells-merge"
        @mousedown.prevent
        @click="doMerge"
      >
        Merge
      </Button>
      <Button
        v-if="canSplit"
        variant="ghost"
        theme="gray"
        size="sm"
        icon-left="lucide-table-cells-split"
        @mousedown.prevent
        @click="doSplit"
      >
        Split
      </Button>
    </div>
  </Teleport>
</template>
