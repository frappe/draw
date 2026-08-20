<script setup>
// Controls for the current whiteboard selection (#363): a lone line or table's
// options, and Delete.
//
// That Delete is the only one a line, table or stroke has by mouse, which is why
// the bar it replaces had to mount on a unified document as well as a whiteboard
// one. A lone sticky is handled by its own richer group, so it is skipped here.
//
// A table stays selected for the whole lifetime of a cell/range pick (#553):
// startCellRangeDrag never reselects, it only sets cellRange/editingCell. So this
// group is the one place that has to work in BOTH "table selected, no cell
// picked" and "table selected, cell/range picked" modes — the Table menu, Text
// Colour, Fill and Border all read useTableSelection().hasSelection to pick which
// one they are reading/writing (#556). TableCellGroup, by contrast, only ever
// shows once a cell IS picked, so it stays cell-only.
import { computed } from 'vue'
import { Popover, TextInput, ItemListRow } from 'frappe-ui'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { useTableSelection } from '@/composables/useTableSelection.js'
import { lineById, tableById, tableCellStyle } from '@/diagram/whiteboardModel.js'
import { tableHeaderRows, tableHeaderCols } from '@/diagram/tableStructure.js'
import { tableMenuOptions } from './tableMenu.js'
import LineOptions from '@/components/floating/LineOptions.vue'
import TableOptions from '@/components/floating/TableOptions.vue'
import ColorPicker from '@/components/palette-right/ColorPicker.vue'
import EspressoSwatchGrid from '@/components/palette-right/EspressoSwatchGrid.vue'
import ToolbarButton from '../ToolbarButton.vue'
import ToolbarSeparator from '../ToolbarSeparator.vue'

// Border styles shown VISUALLY (a line preview), matching FillBorderSection's
// shape-border control — the same visual language, on a table (#556).
const DASH_STYLES = ['solid', 'dashed', 'dotted']
const DASH_ARRAY = { solid: '0', dashed: '5 3', dotted: '1.5 3' }

const store = useDiagramStore()
const ui = useWhiteboardUi()
const selection = useTableSelection()

const selectionList = computed(() => ui.state.selection || [])
const multi = computed(() => selectionList.value.length > 1)
const selected = computed(() => ui.state.selected)
const kind = computed(() => selected.value?.kind)

const line = computed(() =>
  kind.value === 'line' ? lineById(store.state.whiteboard, selected.value.id) : null,
)
const table = computed(() =>
  kind.value === 'table' ? tableById(store.state.whiteboard, selected.value.id) : null,
)
const show = computed(() => multi.value || Boolean(selected.value && kind.value !== 'sticky'))

// The header checkboxes write a header ROW or COLUMN count, and those have to
// travel through the model's own writers — the row one keeps the legacy
// `hasHeader` flag in step, the column one (#556) has no legacy shape to keep.
function changeTable(patch) {
  if ('headerRows' in patch) store.setTableHeaderRows(table.value.id, patch.headerRows)
  else if ('headerCols' in patch) store.setTableHeaderCols(table.value.id, patch.headerCols)
  else store.updateTable(table.value.id, patch)
}

// Combined "Edit table" + "Table actions" into one control (#556): the popup
// holds the row/column steppers and header checkboxes (TableOptions) followed by
// the same structural actions the old separate dropdown offered. Rendered as
// plain ItemListRows rather than through frappe-ui's Dropdown/Menu — a Dropdown
// item is a Reka menu row that treats any click inside it as "select the item",
// which would fight TableOptions' own steppers and checkboxes sitting in the
// same popup; ItemListRow is the same row frappe-ui's own Menu renders with,
// used directly, with none of that selection wiring.
// tableMenuOptions' delete/header-toggle entries all act on a target row or
// column, which only exists once a cell is picked (selection.hasSelection). With
// nothing picked — reachable now that the combined control shows for the table
// alone (#556) — every one of those actions would be a silent no-op (onSelection
// guards on `bounds`, and `rows.value.every(...)` on an empty array is
// vacuously true, which used to read as "already the header" for a picked
// selection but would misread as true here too). So this state gets its own
// smaller menu: only inserts, which have an obvious top/bottom/left/right
// target without a pick, plus deleting the table itself.
const tableMenu = computed(() => {
  if (!table.value) return []
  if (selection.hasSelection.value) {
    return tableMenuOptions({
      rowCount: selection.rows.value.length,
      columnCount: selection.columns.value.length,
      isHeader: selection.selectionIsHeader.value,
      isHeaderColumn: selection.selectionIsHeaderColumn.value,
      actions: selection,
    })
  }
  const id = table.value.id
  return [
    {
      group: 'Rows',
      key: 'rows',
      options: [
        { label: 'Insert row above', icon: 'lucide-arrow-up', onClick: () => store.insertTableRow(id, 0) },
        { label: 'Insert row below', icon: 'lucide-arrow-down', onClick: () => store.insertTableRow(id, table.value.rows) },
      ],
    },
    {
      group: 'Columns',
      key: 'columns',
      options: [
        { label: 'Insert column left', icon: 'lucide-arrow-left', onClick: () => store.insertTableColumn(id, 0) },
        { label: 'Insert column right', icon: 'lucide-arrow-right', onClick: () => store.insertTableColumn(id, table.value.cols) },
      ],
    },
    {
      group: 'Table',
      key: 'table',
      options: [{ label: 'Delete table', icon: 'lucide-trash-2', onClick: () => selection.deleteTable() }],
    },
  ]
})

// ----- text colour, fill, border: one control each, working on whichever of
// "the table" or "the picked cell(s)" is current (#556). -----

const firstCell = computed(() => selection.cells.value[0] || null)
const cellStyle = computed(() =>
  firstCell.value ? tableCellStyle(table.value, firstCell.value.row, firstCell.value.col) : null,
)

function writeCellsOrTable(cellPatch, tablePatch) {
  if (!table.value) return
  if (selection.hasSelection.value) store.setTableCellStyle(table.value.id, selection.cells.value, cellPatch)
  else store.updateTable(table.value.id, tablePatch)
}

const textColor = computed(() =>
  selection.hasSelection.value ? cellStyle.value?.color || '#171717' : table.value?.color || '#171717',
)
function setTextColor(hex) {
  writeCellsOrTable({ color: hex }, { color: hex })
}

const fillColor = computed(() =>
  selection.hasSelection.value ? cellStyle.value?.fill : table.value?.fill,
)
function setFill(hex) {
  writeCellsOrTable({ fill: hex }, { fill: hex })
}

const border = computed(() =>
  selection.hasSelection.value
    ? cellStyle.value?.border
    : { color: table.value?.border?.color || '#171717', width: table.value?.border?.width ?? 1, dash: table.value?.border?.dash || 'solid' },
)
function setBorderColor(hex) {
  writeCellsOrTable({ borderColor: hex }, { border: { color: hex } })
}
function setBorderWidth(value) {
  const width = Number(value)
  if (width >= 0) writeCellsOrTable({ borderWidth: width }, { border: { width } })
}
function setBorderDash(value) {
  writeCellsOrTable({ borderDash: value }, { border: { dash: value } })
}

function remove() {
  store.removeWhiteboardObjects([...selectionList.value])
  ui.clearSelection()
}
</script>

<template>
  <template v-if="show">
    <span v-if="multi" class="px-1.5 text-sm text-ink-gray-6">{{ selectionList.length }} selected</span>

    <Popover v-else-if="line">
      <template #trigger>
        <ToolbarButton label="Edit line" icon="lucide-minus" />
      </template>
      <template #default>
        <LineOptions
          :start="line.start"
          :end="line.end"
          :color="line.color"
          :width="line.width"
          @change="store.updateLine(line.id, $event)"
        />
      </template>
    </Popover>

    <Popover v-else-if="table">
      <template #trigger>
        <ToolbarButton label="Table" icon="lucide-table-properties" allows-blur />
      </template>
      <template #default="{ toggle }">
        <TableOptions
          mode="edit"
          :rows="table.rows"
          :cols="table.cols"
          :header-rows="tableHeaderRows(table)"
          :header-cols="tableHeaderCols(table)"
          :align="table.align"
          @change="changeTable"
        />
        <div class="mx-2 my-1 h-px bg-outline-gray-2" />
        <!-- Rows / Columns side by side, Table (the last group) spanning both —
             a single narrow column here was what ran this popup off the bottom
             of the screen (#556 feedback). Matches TableOptions' own w-72. -->
        <div class="grid w-72 grid-cols-2 gap-x-1 px-1 pb-1">
          <div
            v-for="(group, index) in tableMenu"
            :key="group.key"
            class="py-1 first:pt-0 last:pb-0"
            :class="index === tableMenu.length - 1 ? 'col-span-2' : ''"
          >
            <div class="flex h-7 items-center px-2 text-sm font-medium text-ink-gray-4">{{ group.group }}</div>
            <ItemListRow
              v-for="item in group.options"
              :key="item.label"
              as="button"
              type="button"
              size="sm"
              class="w-full text-left hover:bg-surface-gray-2"
              @click="item.onClick(); toggle()"
            >
              <template #prefix>
                <span :class="[item.icon, 'size-4 shrink-0 text-ink-gray-5']" aria-hidden="true" />
              </template>
              <template #label>{{ item.label }}</template>
            </ItemListRow>
          </div>
        </div>
      </template>
    </Popover>

    <!-- Text colour: the same "A" control a text box carries (#553), now one
         control whether it targets the table's default or a picked cell/range
         (#556, folding in what used to be the cell group's separate circle-swatch
         control). -->
    <Popover v-if="table">
      <template #trigger>
        <ToolbarButton label="Text colour">
          <template #icon>
            <span class="grid size-4 place-items-center rounded text-sm font-semibold" :style="{ color: textColor }">A</span>
          </template>
        </ToolbarButton>
      </template>
      <template #default>
        <div class="p-2">
          <EspressoSwatchGrid mode="fill" :model-value="textColor" :allow-none="false" @select="setTextColor" />
        </div>
      </template>
    </Popover>

    <!-- Fill and Border (#556): same continuous picker Shape Fill/Border uses. -->
    <Popover v-if="table">
      <template #trigger>
        <ToolbarButton label="Fill">
          <template #icon>
            <span class="size-4 rounded border border-outline-gray-2" :style="{ background: fillColor && fillColor !== 'none' ? fillColor : '#FFFFFF' }" />
          </template>
        </ToolbarButton>
      </template>
      <template #default>
        <div class="w-[208px] p-2.5">
          <ColorPicker inline :model-value="fillColor && fillColor !== 'none' ? fillColor : '#FFFFFF'" @update:model-value="setFill" />
        </div>
      </template>
    </Popover>

    <Popover v-if="table">
      <template #trigger>
        <ToolbarButton label="Border" icon="lucide-square" />
      </template>
      <template #default>
        <div class="w-[208px] space-y-2 p-2.5">
          <ColorPicker inline :model-value="border.color" @update:model-value="setBorderColor" />
          <div class="flex gap-1.5">
            <TextInput
              class="flex-1"
              type="number"
              size="md"
              variant="outline"
              :model-value="border.width"
              label="Border weight in pixels"
              @update:model-value="setBorderWidth"
            >
              <template #suffix>
                <span class="text-sm text-ink-gray-5">px</span>
              </template>
            </TextInput>
            <div class="flex flex-1 gap-1">
              <!-- frappe-ui-exempt: mirrors FillBorderSection.vue's shape Border dash row verbatim (established exception — an SVG line preview per style has no frappe-ui component) -->
              <button v-for="style in DASH_STYLES" :key="style" type="button" class="flex h-8 flex-1 items-center justify-center rounded-md border" :class="border.dash === style ? 'border-outline-gray-9 bg-surface-gray-2' : 'border-outline-gray-2 hover:bg-surface-gray-1'" :title="style" :aria-label="style" @click="setBorderDash(style)"> <!-- frappe-ui-exempt: see above -->
                <svg width="30" height="8" viewBox="0 0 30 8">
                  <line x1="2" y1="4" x2="28" y2="4" stroke="currentColor" class="text-ink-gray-8" stroke-width="2" stroke-linecap="round" :stroke-dasharray="DASH_ARRAY[style]" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </template>
    </Popover>

    <ToolbarSeparator />
    <ToolbarButton
      :label="multi ? 'Delete selection' : 'Delete'"
      icon="lucide-trash-2"
      theme="red"
      @click="remove"
    />
  </template>
</template>
