<script setup>
// The floating control for a selected sticky note: colour, strikethrough,
// duplicate, delete (spec W4).
//
// It lives HERE, in the HTML tree, rather than inside WhiteboardStickyNote —
// that component's root is an SVG <g>, and Vue creates a <Teleport>'s content in
// the surrounding namespace, so a toolbar built there is an SVG-namespaced
// <div> with no layout box: in the DOM, zero-sized, invisible and unclickable
// (#356; the same fault hit the table's control in #344). Everything it needs is
// shared state, so nothing is threaded through props.
//
// Single-selection only, so it never clutters a multi-selection, and hidden
// while the note is actively dragged (#248).
import { computed } from 'vue'
import { Divider } from 'frappe-ui'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { useCanvasToolbarStyle } from '@/composables/useCanvasToolbarStyle.js'
import { isDragging } from '@/composables/useShapeTransform.js'
import { stickyNoteById } from '@/diagram/whiteboardModel.js'
import { STICKY_COLORS } from '@/diagram/whiteboardColors.js'

const store = useDiagramStore()
const ui = useWhiteboardUi()

const stickyColors = STICKY_COLORS.slice(0, 6)

const note = computed(() => {
  const selected = ui.state.selected
  if (selected?.kind !== 'sticky') return null
  return stickyNoteById(store.state.whiteboard || {}, selected.id) || null
})
const show = computed(() => !!note.value && !isDragging.value)
const box = computed(() =>
  note.value ? { x: note.value.x, y: note.value.y, w: note.value.w, h: note.value.h } : null,
)
const style = useCanvasToolbarStyle(box)

function setColor(color) {
  store.updateStickyNote(note.value.id, { color })
}
function toggleStrike() {
  store.updateStickyNote(note.value.id, { strike: !note.value.strike })
}
function duplicate() {
  const current = note.value
  const id = store.addStickyNote(current.x + 16, current.y + 16, {
    color: current.color,
    text: current.text,
    author: current.author,
  })
  ui.selectSticky(id)
}
function removeSticky() {
  store.removeStickyNote(note.value.id)
  ui.clearSelection()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show && box"
      data-sticky-toolbar
      class="fixed z-30 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-lg border border-outline-gray-2 bg-surface-base p-1 shadow-lg"
      :style="style"
    >
      <button
        v-for="color in stickyColors"
        :key="color"
        class="h-5 w-5 rounded-full border border-outline-gray-2"
        :style="{ background: color }"
        :aria-label="`Colour ${color}`"
        @pointerdown.stop
        @click="setColor(color)"
      />
      <Divider orientation="vertical" class="mx-0.5 !h-5" />
      <button
        class="flex h-7 w-7 items-center justify-center rounded-md text-ink-gray-7 hover:bg-surface-gray-2"
        :class="note.strike ? 'bg-surface-gray-3 text-ink-gray-9' : ''"
        title="Strikethrough"
        aria-label="Strikethrough"
        @pointerdown.stop
        @click="toggleStrike"
      >
        <span class="lucide-strikethrough h-4 w-4" aria-hidden="true" />
      </button>
      <Divider orientation="vertical" class="mx-0.5 !h-5" />
      <button
        class="flex h-7 w-7 items-center justify-center rounded-md text-ink-gray-7 hover:bg-surface-gray-2"
        title="Duplicate"
        aria-label="Duplicate"
        @pointerdown.stop
        @click="duplicate"
      >
        <span class="lucide-copy h-4 w-4" aria-hidden="true" />
      </button>
      <button
        class="flex h-7 w-7 items-center justify-center rounded-md text-ink-red-4 hover:bg-red-50"
        title="Delete"
        aria-label="Delete"
        @pointerdown.stop
        @click="removeSticky"
      >
        <span class="lucide-trash-2 h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  </Teleport>
</template>
