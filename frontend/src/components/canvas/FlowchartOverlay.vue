<script setup>
// Blank-state affordance for an empty flowchart (spec P3): an explicit "Add
// first step" prompt so starting a flowchart is discoverable — mirroring the
// mind map's "Add your first idea". (Double-click no longer creates nodes; P4.)
// Once there's a node, growing the chart uses the node's hover "+" handles.
import { computed } from 'vue'
import LucideIcon from '@/icons/LucideIcon.vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'

const store = useDiagramStore()
const editorUi = useEditorUi()

const isBlank = computed(() => (store.state.flowchart?.nodes.length ?? 0) === 0)

// Drop the first process node at the canvas origin and frame it. The user then
// types into it (double-click) and grows the chart from its + handles.
function addFirstStep() {
  const id = store.addFlowchartNode('process', '', 0, 0)
  if (!id) return
  setTimeout(() => editorUi.fit?.(), 0)
}
</script>

<template>
  <Teleport to="body">
    <button
      v-if="isBlank"
      class="fixed left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-dashed border-outline-gray-3 bg-surface-base px-5 py-3 text-[14px] font-medium text-ink-gray-7 shadow-sm hover:border-ink-gray-8 hover:text-ink-gray-9"
      @click="addFirstStep"
    >
      <LucideIcon name="plus" class="h-4 w-4" /> Add first step
    </button>
  </Teleport>
</template>
