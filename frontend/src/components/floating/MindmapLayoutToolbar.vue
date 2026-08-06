<script setup>
// Whole-tree layout action for a FREE-FLOATING mind map on the unified canvas
// (#122 P3). A standalone mind-map doc auto-lays-out live through MindMapOverlay, but
// a migrated mind-map node is an ordinary draggable shape, so a branch nudged askew
// stays askew — there is no live reflow once the frame dissolved. This bar surfaces a
// single "Tidy up" action whenever a mind-map node ('mindmap-node') is selected, wired
// to the free-floating shape layout op (store.applyMindmapShapeLayout), which re-flows
// the selected node's whole tree pinned by its root.
//
// It sits pinned to the top-centre of the canvas rather than above the selection: the
// selected shape already shows the block selection editor there, and Tidy is a map-wide
// action (it re-flows the whole tree), not a per-node edit.
import { computed } from 'vue'
import { Button } from 'frappe-ui'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { isMindmapShape } from '@/diagram/freeFloating.js'

const store = useDiagramStore()
const editorUi = useEditorUi()

// The selected mind-map node — its tree is what Tidy re-flows, and it isolates that
// tree from any other mind map on the canvas (#48).
const rootId = computed(
  () => (store.state.selection || []).find((id) => isMindmapShape(store.shapeById(id))) || null,
)

// Show only while a migrated mind-map node is selected.
const active = computed(() => rootId.value != null)

function tidy() {
  editorUi.pulseLayoutAnimation()
  store.applyMindmapShapeLayout('Tidy up', rootId.value)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="active"
      data-mindmap-layout-toolbar
      class="fixed left-1/2 top-[14px] z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-outline-gray-2 bg-surface-base p-1 shadow-lg"
    >
      <Button
        variant="ghost"
        theme="gray"
        size="md"
        icon-left="lucide-grid-2x2"
        label="Tidy up"
        tooltip="Tidy up — re-flow the whole mind map"
        @click="tidy"
      />
    </div>
  </Teleport>
</template>
