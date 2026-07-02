<script setup>
// Contextual editor for the currently selected whiteboard object, shown in the
// bottom palette (there is no whiteboard right panel). Renders the matching
// option controls for a line/table/sticky and writes edits straight to the store
// as undoable mutations. Hidden when nothing editable is selected.
import { computed } from 'vue'
import { Popover, Tooltip } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { lineById, tableById, stickyNoteById } from '@/diagram/whiteboardModel.js'
import { STICKY_COLORS } from '@/diagram/whiteboardColors.js'
import LineOptions from './LineOptions.vue'
import TableOptions from './TableOptions.vue'

const store = useDiagramStore()
const ui = useWhiteboardUi()

// Multi-selection: a single Delete bar acts on every selected object; the
// per-object option controls below stay tied to a lone (single) selection.
const selection = computed(() => ui.state.selection)
const multi = computed(() => selection.value.length > 1)
const REMOVE_FN = {
  stroke: 'removeStroke', sticky: 'removeStickyNote', line: 'removeLine',
  table: 'removeTable', frame: 'removeFrame', stamp: 'removeStamp',
}
function removeAll() {
  for (const item of [...selection.value]) store[REMOVE_FN[item.kind]]?.(item.id)
  ui.clearSelection()
}

const selected = computed(() => ui.state.selected)
const kind = computed(() => selected.value?.kind)

const line = computed(() => (kind.value === 'line' ? lineById(store.state.whiteboard, selected.value.id) : null))
const table = computed(() => (kind.value === 'table' ? tableById(store.state.whiteboard, selected.value.id) : null))
const sticky = computed(() =>
  kind.value === 'sticky' ? stickyNoteById(store.state.whiteboard, selected.value.id) : null,
)
const editable = computed(() => Boolean(line.value || table.value || sticky.value))

const label = computed(() => ({ line: 'Line', table: 'Table', sticky: 'Sticky note' })[kind.value] || 'Selection')
const icon = computed(() => ({ line: 'minus', table: 'grid', sticky: 'square' })[kind.value] || 'edit-2')

function removeSelected() {
  if (line.value) store.removeLine(line.value.id)
  else if (table.value) store.removeTable(table.value.id)
  else if (sticky.value) store.removeStickyNote(sticky.value.id)
  ui.clearSelection()
}

const buttonBase =
  'flex h-[34px] w-[34px] items-center justify-center rounded-md text-ink-gray-7 hover:bg-surface-gray-2'
</script>

<template>
  <!-- Multi-selection: count + one Delete for the whole group. -->
  <template v-if="multi">
    <div class="mx-0.5 h-5 w-px bg-surface-gray-3" />
    <span class="px-1 text-[13px] text-ink-gray-6">{{ selection.length }} selected</span>
    <Tooltip text="Delete selection">
      <button :class="buttonBase" @click="removeAll">
        <LucideIcon name="trash-2" class="h-4 w-4" />
      </button>
    </Tooltip>
  </template>

  <template v-else-if="editable">
    <div class="mx-0.5 h-5 w-px bg-surface-gray-3" />
    <Popover>
      <template #target="{ togglePopover }">
        <Tooltip :text="`Edit ${label.toLowerCase()}`">
          <button :class="buttonBase" @click="togglePopover()">
            <LucideIcon :name="icon" class="h-4 w-4" />
          </button>
        </Tooltip>
      </template>
      <template #body-main>
        <div>
          <LineOptions
            v-if="line"
            :start="line.start"
            :end="line.end"
            :color="line.color"
            :width="line.width"
            @change="store.updateLine(line.id, $event)"
          />
          <TableOptions
            v-else-if="table"
            :rows="table.rows"
            :cols="table.cols"
            :color="table.color"
            @change="store.updateTable(table.id, $event)"
          />
          <div v-else-if="sticky" class="w-44 p-2">
            <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-5">Color</div>
            <div class="grid grid-cols-9 gap-1.5">
              <button
                v-for="swatch in STICKY_COLORS"
                :key="swatch"
                class="h-5 w-5 rounded-sm border"
                :class="sticky.color === swatch ? 'border-[1.5px] border-ink-gray-9' : 'border-outline-gray-2'"
                :style="{ background: swatch }"
                @click="store.updateStickyNote(sticky.id, { color: swatch })"
              />
            </div>
          </div>
        </div>
      </template>
    </Popover>
    <Tooltip text="Delete">
      <button :class="buttonBase" @click="removeSelected">
        <LucideIcon name="trash-2" class="h-4 w-4" />
      </button>
    </Tooltip>
  </template>
</template>
