<script setup>
// Floating contextual toolbar for the current whiteboard selection — hovers above
// the selection like the block/flowchart/mind-map toolbars (there is no right
// panel). Shows line/table options for a lone line/table, a Delete for any other
// lone object, and an "{n} selected" Delete bar for a multi-selection. A lone
// sticky is handled by its own richer per-note toolbar, so it's skipped here.
// Mounted once per editor (EditorShell).
import { computed } from 'vue'
import { Button, Popover } from 'frappe-ui'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useCanvasToolbarStyle } from '@/composables/useCanvasToolbarStyle.js'
import { isDragging } from '@/composables/useShapeTransform.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { lineById, tableById, whiteboardObjectBoxes } from '@/diagram/whiteboardModel.js'
import { unionBounds } from '@/diagram/geometry.js'
import LineOptions from './LineOptions.vue'
import TableOptions from './TableOptions.vue'

const store = useDiagramStore()
const ui = useWhiteboardUi()

const selection = computed(() => ui.state.selection || [])
const multi = computed(() => selection.value.length > 1)
const selected = computed(() => ui.state.selected) // the lone object, or null
const kind = computed(() => selected.value?.kind)

const line = computed(() => (kind.value === 'line' ? lineById(store.state.whiteboard, selected.value.id) : null))
const table = computed(() => (kind.value === 'table' ? tableById(store.state.whiteboard, selected.value.id) : null))
const label = computed(() => ({ line: 'Line', table: 'Table' })[kind.value] || 'Options')
const icon = computed(() => ({ line: 'lucide-minus', table: 'lucide-table' })[kind.value] || 'lucide-pencil')

// Show for a multi-selection, or a lone non-sticky object (a lone sticky uses its
// own floating toolbar).
const show = computed(() => multi.value || Boolean(selected.value && kind.value !== 'sticky'))

// Combined bounding box (canvas units) of the selection, for positioning.
const box = computed(() => {
  const keys = new Set(selection.value.map((s) => `${s.kind}:${s.id}`))
  const boxes = whiteboardObjectBoxes(store.state.whiteboard)
    .filter((o) => keys.has(`${o.kind}:${o.id}`))
    .map((o) => o.box)
  return unionBounds(boxes)
})

const style = useCanvasToolbarStyle(box)

function remove() {
  store.removeWhiteboardObjects([...selection.value])
  ui.clearSelection()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show && box && !isDragging"
      data-wb-toolbar
      class="fixed z-30 flex max-w-[50vw] -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-lg border border-outline-gray-2 bg-surface-base p-1 shadow-lg"
      :style="style"
    >
      <template v-if="multi">
        <span class="px-1.5 text-[13px] text-ink-gray-6">{{ selection.length }} selected</span>
      </template>

      <!-- Lone line/table: its option controls in a popover. -->
      <Popover v-else-if="line || table" side="top">
        <template #target="{ togglePopover }">
          <Button
            variant="ghost"
            theme="gray"
            size="md"
            :icon="icon"
            :tooltip="`Edit ${label.toLowerCase()}`"
            :label="`Edit ${label.toLowerCase()}`"
            @mousedown.prevent
            @click="togglePopover()"
          />
        </template>
        <template #body-main>
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

      <Button
        variant="ghost"
        theme="red"
        size="md"
        icon="lucide-trash-2"
        :tooltip="multi ? 'Delete selection' : 'Delete'"
        :label="multi ? 'Delete selection' : 'Delete'"
        @mousedown.prevent
        @click="remove"
      />
    </div>
  </Teleport>
</template>
