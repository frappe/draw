<script setup>
// Blank-state affordance for an empty flowchart (spec P3): an explicit "Add
// first step" prompt so starting a flowchart is discoverable — mirroring the
// mind map's "Add your first idea". (Double-click no longer creates nodes; P4.)
// Once there's a node, growing the chart uses the node's hover "+" handles.
import { computed, nextTick } from 'vue'
import LucideIcon from '@/icons/LucideIcon.vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { nodeSize } from '@/diagram/flowchartModel.js'
import { requestFlowchartEdit } from '@/stores/flowchartUi.js'

const store = useDiagramStore()
const editorUi = useEditorUi()

const isBlank = computed(() => (store.state.flowchart?.nodes.length ?? 0) === 0)

// Drop the first process node at the canvas origin, frame it high on screen, and
// open its editor so the user can type straight away. Framing it near the top
// (rather than dead-centre) keeps the "add next node" picker — which opens below
// the node — clear of the bottom palette.
function addFirstStep() {
  const id = store.addFlowchartNode('process', '', 0, 0)
  if (!id) return
  store.select([id]) // show its "+" extend handles right away
  nextTick(() => {
    const size = nodeSize({ nodeType: 'process' })
    editorUi.viewport.placeTopCenter({ x: 0, y: 0, w: size.w, h: size.h }, 120)
    requestFlowchartEdit(id)
  })
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
