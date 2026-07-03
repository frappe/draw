<script setup>
// Bottom-LEFT viewport controls (spec B1/B3/Q17): zoom out · editable % · zoom
// in · fit-to-view. Split out of the bottom-center palette so navigation lives
// in its own group, consistently for EVERY diagram type (block/flowchart/
// mindmap/whiteboard). Wired to the shared viewport + editorUi.
import { computed, ref, nextTick } from 'vue'
import { Tooltip } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import { useEditorUi } from '@/stores/useEditorUi.js'

const editorUi = useEditorUi()
const viewport = editorUi.viewport

const buttonBase =
  'flex h-[34px] w-[34px] items-center justify-center rounded-md text-ink-gray-7 hover:bg-surface-gray-2'

// Click the zoom % to type an exact value (spec 1.6).
const zoomEditing = ref(false)
const zoomDraft = ref('')
const zoomInput = ref(null)
function startZoomEdit() {
  zoomDraft.value = String(editorUi.zoomPercent)
  zoomEditing.value = true
  nextTick(() => {
    zoomInput.value?.focus()
    zoomInput.value?.select()
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
    <Tooltip text="Zoom out">
      <button :class="buttonBase" @click="viewport.zoomStep(-1)">
        <LucideIcon name="minus" class="h-4 w-4" />
      </button>
    </Tooltip>
    <input
      v-if="zoomEditing"
      ref="zoomInput"
      v-model="zoomDraft"
      type="text"
      inputmode="numeric"
      class="h-[34px] w-[52px] rounded-md border border-outline-gray-2 bg-surface-base text-center text-xs font-medium text-ink-gray-8 outline-none focus:border-outline-gray-3"
      @keydown.enter="commitZoom"
      @keydown.esc="zoomEditing = false"
      @blur="commitZoom"
    />
    <Tooltip v-else text="Click to set zoom (⌘0 = 100%, ⇧1 = fit)">
      <button
        class="h-[34px] min-w-[46px] rounded-md px-1.5 text-xs font-medium text-ink-gray-7 hover:bg-surface-gray-2"
        @click="startZoomEdit"
      >
        {{ zoomPercent }}%
      </button>
    </Tooltip>
    <Tooltip text="Zoom in">
      <button :class="buttonBase" @click="viewport.zoomStep(1)">
        <LucideIcon name="plus" class="h-4 w-4" />
      </button>
    </Tooltip>
    <div class="mx-0.5 h-5 w-px bg-surface-gray-3" />
    <Tooltip text="Fit to view">
      <button :class="buttonBase" @click="editorUi.fit()">
        <LucideIcon name="maximize" class="h-4 w-4" />
      </button>
    </Tooltip>
  </div>
</template>
