<script setup>
// Node-type swap for a single selected MIGRATED flowchart node shape (#410).
//
// The legacy FlowchartNodeGroup's "Node type" popover only ever wrote to the empty
// sub-model (state.flowchart) and never rendered here anyway: useSelectionContext
// resolves a migrated flowchart node to 'block' chrome, so the free-floating canvas
// had no way at all to change a node's type once it existed. This is the free-
// floating counterpart — the same grid of types, but it calls
// store.swapFlowchartNodeType, which patches the tagged shape (and its outgoing
// edges' ports) in place.
//
// The glyphs come from ShapeGlyph rather than a lucide stand-in, so each entry draws
// the shape it actually inserts — matching the on-canvas FlowchartNodeTypePicker and
// the Insert cluster's own flowchart grid.
import { computed } from 'vue'
import { Popover } from 'frappe-ui'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { isFlowchartShape } from '@/diagram/freeFloating.js'
import { NODE_TYPES, NODE_TYPE_META } from '@/diagram/flowchartModel.js'
import ShapeGlyph from '@/components/floating/ShapeGlyph.vue'
import ToolbarButton from '../ToolbarButton.vue'

const props = defineProps({ shapes: { type: Array, required: true } })

const store = useDiagramStore()

// Single selection only: a type swap resizes the node to its type's default box, so
// applying it to a multi-selection would silently re-box every one of them.
const node = computed(() => {
  const [only] = props.shapes
  return props.shapes.length === 1 && isFlowchartShape(only) ? only : null
})

function swap(nodeType) {
  if (node.value) store.swapFlowchartNodeType(node.value.id, nodeType)
}
</script>

<template>
  <Popover v-if="node">
    <template #trigger><ToolbarButton label="Node type" icon="lucide-shapes" /></template>
    <template #default>
      <div class="grid w-[228px] grid-cols-6 gap-1 p-2">
        <ToolbarButton
          v-for="type in NODE_TYPES"
          :key="type"
          :label="NODE_TYPE_META[type].label"
          :active="node.flowchart?.nodeType === type"
          @click="swap(type)"
        >
          <template #icon><ShapeGlyph family="flowchart" :type="type" class="size-4" /></template>
        </ToolbarButton>
      </div>
    </template>
  </Popover>
</template>
