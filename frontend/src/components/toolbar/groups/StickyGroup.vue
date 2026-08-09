<script setup>
// Controls for a selected sticky note (#363): colour, strikethrough, duplicate,
// delete. Single-selection only, matching the bar it replaces — a multi-selection
// gets the generic whiteboard group instead.
import { computed } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { stickyNoteById } from '@/diagram/whiteboardModel.js'
import { STICKY_COLORS } from '@/diagram/whiteboardColors.js'
import ToolbarButton from '../ToolbarButton.vue'
import ToolbarSeparator from '../ToolbarSeparator.vue'

const store = useDiagramStore()
const ui = useWhiteboardUi()

const stickyColors = STICKY_COLORS.slice(0, 6)

const note = computed(() => {
  const selected = ui.state.selected
  if (selected?.kind !== 'sticky') return null
  return stickyNoteById(store.state.whiteboard || {}, selected.id) || null
})

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
  <template v-if="note">
    <ToolbarButton
      v-for="color in stickyColors"
      :key="color"
      :label="`Colour ${color}`"
      :active="note.color === color"
      @click="setColor(color)"
    >
      <template #icon>
        <span class="h-4 w-4 rounded-full border border-outline-gray-2" :style="{ background: color }" />
      </template>
    </ToolbarButton>

    <ToolbarSeparator />
    <ToolbarButton
      label="Strikethrough"
      icon="lucide-strikethrough"
      :active="Boolean(note.strike)"
      @click="toggleStrike"
    />

    <ToolbarSeparator />
    <ToolbarButton label="Duplicate" icon="lucide-copy" @click="duplicate" />
    <ToolbarButton label="Delete" icon="lucide-trash-2" theme="red" @click="removeSticky" />
  </template>
</template>
