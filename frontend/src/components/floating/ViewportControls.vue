<script setup>
// Bottom-LEFT viewport controls (spec B1/B3/Q17): zoom out · editable % · zoom
// in · fit-to-view. Split out of the bottom-center palette so navigation lives
// in its own group, consistently for EVERY diagram type (block/flowchart/
// mindmap/whiteboard). Wired to the shared viewport + editorUi.
import { computed, ref, nextTick } from 'vue'
import { Button, Divider, TextInput } from 'frappe-ui'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useModeStrategy } from '@/stores/useModeStrategy.js'
import GuidesMenu from './GuidesMenu.vue'

const editorUi = useEditorUi()
const viewport = editorUi.viewport
const modeStrategy = useModeStrategy()

// Guides live here now (next to fit-to-view) rather than in the create palette
// (#95). Still hidden on the whiteboard, where a dotted grid isn't wanted (Q4).
const isWhiteboard = computed(() => modeStrategy?.value?.type === 'whiteboard')

// Click the zoom % to type an exact value (spec 1.6).
const zoomEditing = ref(false)
const zoomDraft = ref('')
const zoomInput = ref(null)
function startZoomEdit() {
  zoomDraft.value = String(editorUi.zoomPercent)
  zoomEditing.value = true
  nextTick(() => {
    zoomInput.value?.el?.focus()
    zoomInput.value?.el?.select()
  })
}
function commitZoom() {
  if (!zoomEditing.value) return
  zoomEditing.value = false
  editorUi.setZoomPercent(zoomDraft.value)
}

const zoomPercent = computed(() => editorUi.zoomPercent)
</script>

<template>
  <div
    class="absolute bottom-[18px] left-3 z-10 flex items-center gap-1 rounded-[10px] border border-outline-gray-1 bg-surface-base p-[5px] shadow-lg"
  >
    <Button variant="ghost" theme="gray" size="md" icon="lucide-minus" tooltip="Zoom out" label="Zoom out" @click="viewport.zoomStep(-1)" />
    <TextInput
      v-if="zoomEditing"
      ref="zoomInput"
      v-model="zoomDraft"
      class="w-[56px] [&_input]:text-center"
      type="text"
      size="md"
      variant="outline"
      inputmode="numeric"
      label="Zoom level"
      @keydown.enter="commitZoom"
      @keydown.esc="zoomEditing = false"
      @blur="commitZoom"
    />
    <Button
      v-else
      class="min-w-[46px]"
      variant="ghost"
      theme="gray"
      size="md"
      tooltip="Click to set zoom (⌘0 = 100%, ⇧1 = fit)"
      label="Set zoom level"
      @click="startZoomEdit"
    >
      <span class="text-sm font-medium tabular-nums">{{ zoomPercent }}%</span>
    </Button>
    <Button variant="ghost" theme="gray" size="md" icon="lucide-plus" tooltip="Zoom in" label="Zoom in" @click="viewport.zoomStep(1)" />
    <Divider orientation="vertical" class="mx-0.5 !h-5" />
    <Button variant="ghost" theme="gray" size="md" icon="lucide-maximize" tooltip="Fit to view" label="Fit to view" @click="editorUi.fit()" />
    <template v-if="!isWhiteboard">
      <Divider orientation="vertical" class="mx-0.5 !h-5" />
      <GuidesMenu />
    </template>
  </div>
</template>
