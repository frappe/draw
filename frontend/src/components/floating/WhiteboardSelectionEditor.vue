<script setup>
// Floating contextual toolbar for the current whiteboard selection — hovers above
// the selection like the block/flowchart/mind-map toolbars (there is no right
// panel). Shows line/table options for a lone line/table, a Delete for any other
// lone object, and an "{n} selected" Delete bar for a multi-selection. A lone
// sticky is handled by its own richer per-note toolbar, so it's skipped here.
// Mounted once per editor (EditorShell).
import { computed } from 'vue'
import { Popover, Tooltip } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useCanvasToolbarStyle } from '@/composables/useCanvasToolbarStyle.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { lineById, tableById, whiteboardObjectBoxes, voteFor } from '@/diagram/whiteboardModel.js'
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
const icon = computed(() => ({ line: 'minus', table: 'grid' })[kind.value] || 'edit-2')

// Show for a multi-selection, or a lone non-sticky object (a lone sticky uses its
// own floating toolbar). A lone object also gets up/down vote; strokes get just
// vote + Delete.
const show = computed(() => multi.value || Boolean(selected.value && kind.value !== 'sticky'))

// Combined bounding box (canvas units) of the selection, for positioning.
const box = computed(() => {
  const keys = new Set(selection.value.map((s) => `${s.kind}:${s.id}`))
  const boxes = whiteboardObjectBoxes(store.state.whiteboard)
    .filter((o) => keys.has(`${o.kind}:${o.id}`))
    .map((o) => o.box)
  if (!boxes.length) return null
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y }
})

const style = useCanvasToolbarStyle(box)

// Per-object up/down vote (T3), chat-reaction style. Shown for a lone object
// (any kind); the tally renders as a badge on the object itself.
const votes = computed(() =>
  selected.value ? voteFor(store.state.whiteboard, selected.value.kind, selected.value.id) : { up: 0, down: 0 },
)
function vote(dir) {
  if (selected.value) store.voteWhiteboardObject(selected.value.kind, selected.value.id, dir)
}

function remove() {
  store.removeWhiteboardObjects([...selection.value])
  ui.clearSelection()
}

const btn = 'flex h-8 w-8 items-center justify-center rounded-md text-ink-gray-7 hover:bg-surface-gray-2'
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show && box"
      data-wb-toolbar
      class="fixed z-30 flex max-w-[50vw] -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-lg border border-outline-gray-2 bg-surface-base p-1 shadow-lg"
      :style="style"
    >
      <template v-if="multi">
        <span class="px-1.5 text-[13px] text-ink-gray-6">{{ selection.length }} selected</span>
      </template>

      <!-- Lone line/table: its option controls in a popover. -->
      <Popover v-else-if="line || table">
        <template #target="{ togglePopover }">
          <Tooltip :text="`Edit ${label.toLowerCase()}`">
            <button :class="btn" @mousedown.prevent @click="togglePopover()"><LucideIcon :name="icon" class="h-4 w-4" /></button>
          </Tooltip>
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
            @change="store.updateTable(table.id, $event)"
          />
        </template>
      </Popover>

      <!-- Up / down vote for a lone object (chat-reaction style, T3). -->
      <template v-if="!multi && selected">
        <Tooltip text="Upvote">
          <button :class="btn" @mousedown.prevent @click="vote('up')">
            <span class="text-[13px]">👍</span>
            <span v-if="votes.up" class="ml-0.5 text-[11px] text-ink-gray-6">{{ votes.up }}</span>
          </button>
        </Tooltip>
        <Tooltip text="Downvote">
          <button :class="btn" @mousedown.prevent @click="vote('down')">
            <span class="text-[13px]">👎</span>
            <span v-if="votes.down" class="ml-0.5 text-[11px] text-ink-gray-6">{{ votes.down }}</span>
          </button>
        </Tooltip>
        <div class="mx-0.5 h-5 w-px bg-surface-gray-3" />
      </template>

      <Tooltip :text="multi ? 'Delete selection' : 'Delete'">
        <button class="flex h-8 w-8 items-center justify-center rounded-md text-red-600 hover:bg-red-50" @mousedown.prevent @click="remove">
          <LucideIcon name="trash-2" class="h-4 w-4" />
        </button>
      </Tooltip>
    </div>
  </Teleport>
</template>
