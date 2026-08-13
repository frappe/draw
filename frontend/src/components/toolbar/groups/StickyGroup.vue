<script setup>
// Controls for a selected sticky note (#363): colour and delete on the bar, with
// strikethrough (#419) and duplicate behind a "More" entry. Single-selection only,
// matching the bar it replaces — a multi-selection gets the generic whiteboard
// group instead.
import { computed } from 'vue'
import { Button, Popover } from 'frappe-ui'
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

function toggleStrike(close) {
  store.updateStickyNote(note.value.id, { strike: !note.value.strike })
  close?.()
}

function duplicate(close) {
  const current = note.value
  const id = store.addStickyNote(current.x + 16, current.y + 16, {
    color: current.color,
    text: current.text,
  })
  ui.selectSticky(id)
  close?.()
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
    <!-- Strikethrough is behind "More" rather than on the bar (#419), and Duplicate
         joined it (Vibhav, 13 Aug 2026). Both are things you do once to a note
         rather than while working on one, and each was holding a permanent slot
         next to the colours, which are what people actually reach for. Two entries
         also make the menu worth opening — one was a lid on an almost empty box.
         The trigger stays pressed while the note is struck through, so that state
         is still readable without opening it. -->
    <Popover>
      <template #trigger>
        <ToolbarButton
          label="More sticky note actions"
          icon="lucide-ellipsis"
          :active="Boolean(note.strike)"
        />
      </template>
      <!-- Closes on pick, like the table size picker: these are one-shot actions,
           and a panel left open sits over the rest of the group. -->
      <template #default="{ toggle }">
        <div class="w-44 p-1">
          <Button
            variant="ghost"
            class="w-full justify-start"
            icon-left="lucide-strikethrough"
            label="Strikethrough"
            :aria-pressed="Boolean(note.strike)"
            @click="toggleStrike(toggle)"
          />
          <Button
            variant="ghost"
            class="w-full justify-start"
            icon-left="lucide-copy"
            label="Duplicate"
            @click="duplicate(toggle)"
          />
        </div>
      </template>
    </Popover>

    <ToolbarSeparator />
    <ToolbarButton label="Delete" icon="lucide-trash-2" theme="red" @click="removeSticky" />
  </template>
</template>
