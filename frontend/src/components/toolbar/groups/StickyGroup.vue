<script setup>
// Controls for a selected sticky note (#363): paper colour, then the same text
// options a text box has (#501) — the four marks, size, alignment and text colour.
// Single-selection only, matching the bar it replaces; a multi-selection gets the
// generic whiteboard group instead.
//
// The marks act on the live editor when the note is open and on the whole note when
// it is not, so "select the note and press B" bolds all of it — the behaviour the
// note-wide `strike` boolean used to give, now available to every mark.
import { computed } from 'vue'
import { Popover } from 'frappe-ui'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { stickyNoteById, stickyRuns, stickyTextStyle } from '@/diagram/whiteboardModel.js'
import { STICKY_COLORS } from '@/diagram/whiteboardColors.js'
import { applyMark, markState, runsToText } from '@/diagram/richText.js'
import EspressoSwatchGrid from '@/components/palette-right/EspressoSwatchGrid.vue'
import ToolbarButton from '../ToolbarButton.vue'
import ToolbarSeparator from '../ToolbarSeparator.vue'

const FORMAT_OPTIONS = [
  { mark: 'bold', label: 'Bold', icon: 'lucide-bold' },
  { mark: 'italic', label: 'Italic', icon: 'lucide-italic' },
  { mark: 'underline', label: 'Underline', icon: 'lucide-underline' },
  { mark: 'strike', label: 'Strikethrough', icon: 'lucide-strikethrough' },
]

const ALIGNMENTS = [
  { value: 'left', label: 'Align left', icon: 'lucide-text-align-start' },
  { value: 'center', label: 'Align center', icon: 'lucide-text-align-center' },
  { value: 'right', label: 'Align right', icon: 'lucide-text-align-end' },
]

const store = useDiagramStore()
const ui = useWhiteboardUi()

const stickyColors = STICKY_COLORS.slice(0, 6)

const note = computed(() => {
  const selected = ui.state.selected
  if (selected?.kind !== 'sticky') return null
  return stickyNoteById(store.state.whiteboard || {}, selected.id) || null
})

const runs = computed(() => (note.value ? stickyRuns(note.value) : []))
const textStyle = computed(() => (note.value ? stickyTextStyle(note.value) : null))

function setColor(color) {
  store.updateStickyNote(note.value.id, { color })
}

// Whole-note marks. A range selection inside an open note is the editor's own job;
// this acts on the note as a unit, which is what a selected-but-not-open note means.
function markActive(mark) {
  return markState(runs.value, 0, runsToText(runs.value).length, mark) === true
}

function toggleMark(mark) {
  const text = runsToText(runs.value)
  store.setStickyRuns(note.value.id, applyMark(runs.value, 0, text.length, mark, !markActive(mark)))
}

function setTextStyle(patch) {
  store.setStickyTextStyle(note.value.id, patch)
}

function stepFontSize(delta) {
  setTextStyle({ size: Math.max(6, Math.min(200, textStyle.value.size + delta)) })
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
      v-for="option in FORMAT_OPTIONS"
      :key="option.mark"
      :label="option.label"
      :icon="option.icon"
      :active="markActive(option.mark)"
      @click="toggleMark(option.mark)"
    />

    <div class="flex items-center rounded-md border border-outline-gray-2">
      <ToolbarButton class="!w-6" label="Decrease note font size" icon="lucide-minus" @click="stepFontSize(-1)" />
      <span class="w-6 text-center text-sm tabular-nums text-ink-gray-8">{{ textStyle.size }}</span>
      <ToolbarButton class="!w-6" label="Increase note font size" icon="lucide-plus" @click="stepFontSize(1)" />
    </div>

    <ToolbarButton
      v-for="option in ALIGNMENTS"
      :key="option.value"
      :label="option.label"
      :icon="option.icon"
      :active="textStyle.align === option.value"
      @click="setTextStyle({ align: option.value })"
    />

    <!-- Text colour, which is a different axis from the note's PAPER colour above.
         The paper stays the six named fills from the spec, deliberately out of the
         palette sweep (#495); the ink is on the shared grid like every other text. -->
    <Popover>
      <template #trigger>
        <ToolbarButton label="Note text colour">
          <template #icon>
            <span class="size-4 rounded-full" :style="{ background: textStyle.color }" />
          </template>
        </ToolbarButton>
      </template>
      <template #default>
        <div class="p-2">
          <EspressoSwatchGrid
            mode="fill"
            :model-value="textStyle.color"
            :allow-none="false"
            @select="setTextStyle({ color: $event })"
          />
        </div>
      </template>
    </Popover>

    <ToolbarSeparator />
    <ToolbarButton label="Delete" icon="lucide-trash-2" theme="red" @click="removeSticky" />
  </template>
</template>
