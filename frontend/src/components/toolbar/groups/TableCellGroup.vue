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
import { mergeCovering, tableById } from '@/diagram/whiteboardModel.js'
import ToolbarButton from '../ToolbarButton.vue'
import ToolbarSeparator from '../ToolbarSeparator.vue'

const FORMAT_OPTIONS = [
  { mark: 'bold', label: 'Bold', icon: 'lucide-bold' },
  { mark: 'italic', label: 'Italic', icon: 'lucide-italic' },
  { mark: 'underline', label: 'Underline', icon: 'lucide-underline' },
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
const show = computed(
  () => !!table.value && (!!editingCell.value || canMerge.value || canSplit.value),
)

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
</script>

<template>
  <template v-if="show">
    <ToolbarButton
      v-for="option in FORMAT_OPTIONS"
      :key="option.mark"
      :label="option.label"
      :icon="option.icon"
      :active="activeMarks[option.mark] === true"
      @click="toggleMark(option.mark)"
    />

    <template v-if="canMerge || canSplit">
      <ToolbarSeparator />
      <ToolbarButton v-if="canMerge" label="Merge cells" icon-left="lucide-table-cells-merge" @click="doMerge">
        Merge
      </ToolbarButton>
      <ToolbarButton v-if="canSplit" label="Split cell" icon-left="lucide-table-cells-split" @click="doSplit">
        Split
      </ToolbarButton>
    </template>
  </template>
</template>
