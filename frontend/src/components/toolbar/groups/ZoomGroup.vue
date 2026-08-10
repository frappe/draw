<script setup>
// The zoom control: ONE compact entry showing the live percentage, opening a
// menu — the shape Google Slides uses. It replaces the four-button group that
// was the last floating chrome left on the canvas, bottom-left, so the canvas
// now holds the minimap and nothing else.
//
// The typed value survives the move (spec 1.6). The stops below are round
// numbers and the steps are 10% apart, so typing stays the only way to ask for
// something like 137%.
//
// "100%" runs reset100, which is what ⌘0 does: it recentres as well as
// rescaling. Picking any other percentage only rescales — a user choosing 200%
// is looking at something and wants it bigger, not moved.
import { computed, ref } from 'vue'
import { Button, Divider, Popover, TextInput } from 'frappe-ui'
import { useEditorUi } from '@/stores/useEditorUi.js'
import ToolbarButton from '../ToolbarButton.vue'

const editorUi = useEditorUi()

// The viewport clamps to 10–400%; these are the round stops inside it.
const LEVELS = [50, 75, 100, 125, 150, 200]

const zoomPercent = computed(() => editorUi.zoomPercent)
const draft = ref('')

function apply(percent, close) {
  if (percent === 100) editorUi.reset100()
  else editorUi.setZoomPercent(percent)
  close()
}

function applyDraft(close) {
  editorUi.setZoomPercent(draft.value)
  close()
}

function fitToView(close) {
  editorUi.fit()
  close()
}
</script>

<template>
  <Popover align="end">
    <template #trigger>
      <!-- The accessible name carries the visible text, so a screen reader and
           the screen say the same thing. `min-w` and tabular figures keep the
           entry from resizing as the number changes under it. -->
      <ToolbarButton
        allows-blur
        class="min-w-[54px] tabular-nums"
        :label="`Zoom ${zoomPercent}%`"
        tooltip="Zoom"
        @click="draft = String(zoomPercent)"
      >
        {{ zoomPercent }}%
      </ToolbarButton>
    </template>

    <template #default="{ close }">
      <div class="w-[184px] p-2">
        <div class="px-1 pb-1.5 text-2xs font-semibold text-ink-gray-4">Zoom level</div>
        <TextInput
          v-model="draft"
          class="[&_input]:tabular-nums"
          type="text"
          size="sm"
          variant="outline"
          inputmode="numeric"
          aria-label="Zoom level"
          placeholder="100"
          @keydown.enter="applyDraft(close)"
          @keydown.esc="close()"
        >
          <template #suffix><span class="text-sm text-ink-gray-5">%</span></template>
        </TextInput>

        <Divider class="my-2" />

        <Button
          class="w-full !justify-start"
          variant="ghost"
          theme="gray"
          size="sm"
          label="Fit to view"
          @click="fitToView(close)"
        >
          <template #suffix><span class="ml-auto text-2xs text-ink-gray-4">⇧1</span></template>
        </Button>
        <Button
          v-for="level in LEVELS"
          :key="level"
          class="w-full !justify-start tabular-nums aria-pressed:bg-surface-gray-3"
          variant="ghost"
          theme="gray"
          size="sm"
          :label="`${level}%`"
          :aria-pressed="zoomPercent === level"
          @click="apply(level, close)"
        >
          <template v-if="level === 100" #suffix>
            <span class="ml-auto text-2xs text-ink-gray-4">⌘0</span>
          </template>
        </Button>
      </div>
    </template>
  </Popover>
</template>
