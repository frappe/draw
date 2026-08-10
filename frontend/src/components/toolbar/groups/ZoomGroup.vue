<script setup>
// View controls: zoom out, the live percentage, zoom in, fit-to-view.
//
// These were the last floating group on the canvas, bottom-left. On the toolbar
// they sit with the canvas menu, because they act on the whole view rather than
// on the selection — and the canvas is now clear of chrome apart from the
// minimap.
//
// The percentage is a button until you click it, then an input: typing an exact
// zoom is the only way to reach a value the steps skip (spec 1.6).
import { computed, ref, nextTick } from 'vue'
import { TextInput } from 'frappe-ui'
import { useEditorUi } from '@/stores/useEditorUi.js'
import ToolbarButton from '../ToolbarButton.vue'

const editorUi = useEditorUi()
const viewport = editorUi.viewport

const zoomPercent = computed(() => editorUi.zoomPercent)

const editing = ref(false)
const draft = ref('')
const input = ref(null)

function startEdit() {
  draft.value = String(editorUi.zoomPercent)
  editing.value = true
  nextTick(() => {
    input.value?.el?.focus()
    input.value?.el?.select()
  })
}

function commit() {
  if (!editing.value) return
  editing.value = false
  editorUi.setZoomPercent(draft.value)
}
</script>

<template>
  <ToolbarButton allows-blur label="Zoom out" icon="lucide-minus" @click="viewport.zoomStep(-1)" />

  <TextInput
    v-if="editing"
    ref="input"
    v-model="draft"
    class="w-[56px] [&_input]:h-7 [&_input]:text-center"
    type="text"
    size="sm"
    variant="outline"
    inputmode="numeric"
    label="Zoom level"
    @keydown.enter="commit"
    @keydown.esc="editing = false"
    @blur="commit"
  />
  <ToolbarButton
    v-else
    allows-blur
    class="min-w-[46px]"
    label="Set zoom level"
    tooltip="Click to set zoom (⌘0 = 100%, ⇧1 = fit)"
    @click="startEdit"
  >
    <span class="text-sm font-medium tabular-nums">{{ zoomPercent }}%</span>
  </ToolbarButton>

  <ToolbarButton allows-blur label="Zoom in" icon="lucide-plus" @click="viewport.zoomStep(1)" />
  <ToolbarButton allows-blur label="Fit to view" icon="lucide-maximize" @click="editorUi.fit()" />
</template>
