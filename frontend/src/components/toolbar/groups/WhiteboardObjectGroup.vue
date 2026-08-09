<script setup>
// Controls for the current whiteboard selection (#363): a lone line or table's
// options, and Delete.
//
// That Delete is the only one a line, table or stroke has by mouse, which is why
// the bar it replaces had to mount on a unified document as well as a whiteboard
// one. A lone sticky is handled by its own richer group, so it is skipped here.
import { computed } from 'vue'
import { Popover } from 'frappe-ui'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { lineById, tableById } from '@/diagram/whiteboardModel.js'
import LineOptions from '@/components/floating/LineOptions.vue'
import TableOptions from '@/components/floating/TableOptions.vue'
import ToolbarButton from '../ToolbarButton.vue'

const store = useDiagramStore()
const ui = useWhiteboardUi()

const selection = computed(() => ui.state.selection || [])
const multi = computed(() => selection.value.length > 1)
const selected = computed(() => ui.state.selected)
const kind = computed(() => selected.value?.kind)

const line = computed(() =>
  kind.value === 'line' ? lineById(store.state.whiteboard, selected.value.id) : null,
)
const table = computed(() =>
  kind.value === 'table' ? tableById(store.state.whiteboard, selected.value.id) : null,
)
const show = computed(() => multi.value || Boolean(selected.value && kind.value !== 'sticky'))

function remove() {
  store.removeWhiteboardObjects([...selection.value])
  ui.clearSelection()
}
</script>

<template>
  <template v-if="show">
    <span v-if="multi" class="px-1.5 text-sm text-ink-gray-6">{{ selection.length }} selected</span>

    <Popover v-else-if="line || table">
      <template #trigger>
        <ToolbarButton
          :label="line ? 'Edit line' : 'Edit table'"
          :icon="line ? 'lucide-minus' : 'lucide-table'"
        />
      </template>
      <template #default>
        <LineOptions
          v-if="line"
          :start="line.start"
          :end="line.end"
          :color="line.color"
          :width="line.width"
          @change="store.updateLine(line.id, $event)"
        />
        <TableOptions
          v-else
          mode="edit"
          :rows="table.rows"
          :cols="table.cols"
          :color="table.color"
          :has-header="table.hasHeader"
          :align="table.align"
          @change="store.updateTable(table.id, $event)"
        />
      </template>
    </Popover>

    <ToolbarButton
      :label="multi ? 'Delete selection' : 'Delete'"
      icon="lucide-trash-2"
      theme="red"
      @click="remove"
    />
  </template>
</template>
