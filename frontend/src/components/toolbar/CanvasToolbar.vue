<script setup>
// The static canvas toolbar (#359). One bar below the title bar and above the
// ruler, holding every control that used to float over the canvas, with contents
// that follow the selection.
//
// It replaces eight separate floating bars. Those anchored themselves above the
// selection, so a shape near the top of the canvas pushed its toolbar over the
// title bar, and every control moved on each pan, zoom and selection change.
//
// The item contract mirrors frappe-ui's own EditorFixedMenu: ghost buttons,
// pressed state through aria-pressed, one shared TooltipProvider so neighbouring
// tooltips open without re-delay, and the same data-slot hooks. The menu itself
// is ours because EditorFixedMenu binds to a Tiptap editor, and this one drives
// four canvas models.
//
// The canvas group is pinned right and always present, so entries never shift
// sideways as the contextual middle changes. The insert cluster arrives with
// #364, and the mind-map, flowchart and whiteboard groups with #362 and #363.
import { computed } from 'vue'
import { TooltipProvider } from 'frappe-ui'
import { useSelectionContext } from '@/composables/useSelectionContext.js'
import { useBlockSelection } from '@/composables/useBlockSelection.js'
import { useMindmapSelection } from '@/composables/useMindmapSelection.js'
import { useFlowchartSelection } from '@/composables/useFlowchartSelection.js'
import { useModeStrategy } from '@/stores/useModeStrategy.js'
import { isUnifiedDocument } from '@/diagram/schema.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import CanvasGroup from './groups/CanvasGroup.vue'
import StyleGroup from './groups/StyleGroup.vue'
import TextGroup from './groups/TextGroup.vue'
import ArrangeGroup from './groups/ArrangeGroup.vue'
import BlockActionsGroup from './groups/BlockActionsGroup.vue'
import LineGroup from './groups/LineGroup.vue'
import MindmapStyleGroup from './groups/MindmapStyleGroup.vue'
import MindmapNodeGroup from './groups/MindmapNodeGroup.vue'
import FlowchartNodeGroup from './groups/FlowchartNodeGroup.vue'
import MapLayoutGroup from './groups/MapLayoutGroup.vue'
import WhiteboardObjectGroup from './groups/WhiteboardObjectGroup.vue'
import StickyGroup from './groups/StickyGroup.vue'
import TableCellGroup from './groups/TableCellGroup.vue'
import HistoryGroup from './groups/HistoryGroup.vue'
import PointerGroup from './groups/PointerGroup.vue'
import InsertGroups from './groups/InsertGroups.vue'
import WhiteboardTools from '@/components/floating/WhiteboardTools.vue'
import ToolbarSeparator from './ToolbarSeparator.vue'

const { chromeType } = useSelectionContext()
const { connector, hasShapes, count, editing } = useBlockSelection()
const mindmap = useMindmapSelection()
const store = useDiagramStore()
const modeStrategy = useModeStrategy()
const flowchart = useFlowchartSelection()

// Text and image are block shapes even on the whiteboard, so their format menu
// is the block group there too (S13/S14/U1). The whiteboard's own objects get
// their groups in #363.
const showsBlockGroups = computed(
  () => chromeType.value === 'block' || chromeType.value === 'whiteboard',
)
const shapeSelected = computed(() => showsBlockGroups.value && hasShapes.value)
const connectorSelected = computed(() => showsBlockGroups.value && Boolean(connector.value))
// Delete acts on the shape, so it hides while a label is being edited.
const showsActions = computed(
  () => showsBlockGroups.value && count.value > 0 && !editing.value,
)

// The insert cluster is the block / unified layout's, the one with a shape
// catalog. A legacy mind map, flowchart or whiteboard keeps its own tools.
const isUnified = computed(() => isUnifiedDocument(store.state))
const isCreateCanvas = computed(
  () => modeStrategy?.value?.type === 'block' || isUnified.value,
)
// On the unified bar the annotation group shows only the live modes: Draw,
// Eraser and Laser. Text, line, image, sticky and table are in the Insert menu,
// so excluding them here keeps one control per action.
const UNIFIED_ANNOTATION_EXCLUDE = ['text', 'line', 'image', 'sticky', 'table']
const annotationExclude = computed(() => (isUnified.value ? UNIFIED_ANNOTATION_EXCLUDE : []))
const showsAnnotationTools = computed(
  () => isUnified.value || modeStrategy?.value?.type === 'whiteboard',
)

// A legacy single-type document keeps its nodes in a sub-model, so its groups
// key off chromeType rather than off the shape list.
const mindmapSelected = computed(
  () => chromeType.value === 'mindmap' && mindmap.nodes.value.length > 0,
)
const flowchartSelected = computed(
  () => chromeType.value === 'flowchart' && flowchart.nodes.value.length > 0,
)
</script>

<template>
  <div
    data-canvas-toolbar
    data-slot="fixed-menu"
    class="flex h-10 flex-none items-center gap-1 overflow-x-auto border-b border-outline-gray-1 bg-surface-base px-3"
  >
    <TooltipProvider>
      <div class="flex min-w-0 flex-1 items-center gap-1">
        <HistoryGroup />
        <ToolbarSeparator />
        <PointerGroup />
        <ToolbarSeparator />
        <InsertGroups v-if="isCreateCanvas" />
        <WhiteboardTools v-if="showsAnnotationTools" :exclude="annotationExclude" />
        <ToolbarSeparator />

        <LineGroup v-if="connectorSelected" :connector="connector" />

        <template v-else-if="shapeSelected">
          <template v-if="!editing">
            <StyleGroup />
            <ToolbarSeparator />
          </template>

          <!-- Shown while editing too: this IS the text-only menu then (#259). -->
          <TextGroup />

          <template v-if="!editing">
            <ToolbarSeparator />
            <ArrangeGroup />
          </template>
        </template>

        <template v-if="showsActions">
          <ToolbarSeparator />
          <BlockActionsGroup />
        </template>

        <template v-if="mindmapSelected">
          <MindmapStyleGroup />
          <ToolbarSeparator />
          <MindmapNodeGroup />
        </template>

        <FlowchartNodeGroup v-if="flowchartSelected" />

        <!-- Whiteboard objects. All three self-gate: the sticky group on a lone
             sticky, the cell group on an open cell or a dragged range, and the
             object group on everything else the board holds. -->
        <template v-if="chromeType === 'whiteboard'">
          <StickyGroup />
          <WhiteboardObjectGroup />
          <TableCellGroup />
        </template>

        <!-- Whole-map actions, self-gating: a no-op unless the document is a map
             or a free-floating map node is selected. -->
        <MapLayoutGroup />
      </div>

      <CanvasGroup />
    </TooltipProvider>
  </div>
</template>
