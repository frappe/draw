<script setup>
// Blank-state affordance for an empty flowchart (spec P3): an explicit "Add
// first step" prompt so starting a flowchart is discoverable — mirroring the
// mind map's "Add your first idea". (Double-click no longer creates nodes; P4.)
// Once there's a node, growing the chart uses the node's hover "+" handles.
import { computed, nextTick } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { nodeSize } from '@/diagram/flowchartModel.js'
import { requestFlowchartEdit } from '@/stores/flowchartUi.js'

const store = useDiagramStore()
const editorUi = useEditorUi()

const isBlank = computed(() => (store.state.flowchart?.nodes.length ?? 0) === 0)

// Drop the first process node centred in the CURRENT view and open its editor so the
// user can type straight away. It lands where the user is looking without moving the
// camera (#119: no insert may pan the canvas; #75: it must land in view). The "add
// next node" picker opens below the node and already flips above / clamps when it
// sits well inside the view, so no pan is needed to keep it clear.
function addFirstStep() {
  const size = nodeSize({ nodeType: 'process' })
  const view = editorUi.viewport.visibleRect()
  const x = Math.round(view.x + (view.w - size.w) / 2)
  const y = Math.round(view.y + (view.h - size.h) / 2)
  const id = store.addFlowchartNode('process', '', x, y)
  if (!id) return
  store.select([id]) // show its "+" extend handles right away
  nextTick(() => requestFlowchartEdit(id))
}
</script>

<template>
  <Teleport to="body">
    <button
      v-if="isBlank"
      class="fixed left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-dashed border-outline-gray-3 bg-surface-base px-5 py-3 text-base font-medium text-ink-gray-7 shadow-sm hover:border-outline-gray-8 hover:text-ink-gray-9"
      @click="addFirstStep"
    >
      <span class="lucide-plus h-4 w-4" aria-hidden="true" /> Add first step
    </button>
  </Teleport>
</template>
