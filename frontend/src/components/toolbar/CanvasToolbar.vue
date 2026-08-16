<script setup>
// The static canvas toolbar (#359). One bar below the title bar, holding every
// control that used to float over the canvas, with contents that follow the
// selection.
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
// Everything sits in ONE left-aligned run. The bar used to hold a fixed cluster
// on the far left and the Canvas menu pinned to the far right, with a flex-1
// spacer between them; with nothing selected that read as two islands either
// side of about 900px of nothing, which reads as broken rather than as a toolbar
// with room to spare.
//
// The fixed prefix comes first and never changes, and the contextual groups grow
// off the END of it, so no control moves sideways when the selection changes —
// which is exactly what the eight floating bars did on every click.
import { computed } from 'vue'
import { TooltipProvider } from 'frappe-ui'
import { useSelectionContext } from '@/composables/useSelectionContext.js'
import { useBlockSelection } from '@/composables/useBlockSelection.js'
import { useMindmapSelection } from '@/composables/useMindmapSelection.js'
import { useFlowchartSelection } from '@/composables/useFlowchartSelection.js'
import { useModeStrategy } from '@/stores/useModeStrategy.js'
import { isUnifiedDocument } from '@/diagram/schema.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import GuidesGroup from './groups/GuidesGroup.vue'
import StyleGroup from './groups/StyleGroup.vue'
import TextGroup from './groups/TextGroup.vue'
import ArrangeGroup from './groups/ArrangeGroup.vue'
import BlockActionsGroup from './groups/BlockActionsGroup.vue'
import LineGroup from './groups/LineGroup.vue'
import MindmapStyleGroup from './groups/MindmapStyleGroup.vue'
import MindmapNodeGroup from './groups/MindmapNodeGroup.vue'
import FlowchartNodeGroup from './groups/FlowchartNodeGroup.vue'
import FlowchartNodeTypeGroup from './groups/FlowchartNodeTypeGroup.vue'
import MapLayoutGroup from './groups/MapLayoutGroup.vue'
import WhiteboardObjectGroup from './groups/WhiteboardObjectGroup.vue'
import StickyGroup from './groups/StickyGroup.vue'
import TableCellGroup from './groups/TableCellGroup.vue'
import ZoomGroup from './groups/ZoomGroup.vue'
import PointerGroup from './groups/PointerGroup.vue'
import InsertGroups from './groups/InsertGroups.vue'
import WhiteboardTools from '@/components/floating/WhiteboardTools.vue'
import ToolbarSeparator from './ToolbarSeparator.vue'

const { chromeType } = useSelectionContext()
const { connector, hasShapes, count, editing, shapes } = useBlockSelection()
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
// The pointer group owns the laser on EVERY canvas now, so the annotation group
// never renders it — a whiteboard document would otherwise show it twice.
const ALWAYS_EXCLUDE = ['laser']
// On the unified bar the annotation group is left with the live modes, Draw and
// Eraser. Text, line, image, sticky and table are entries of their own in the
// insert cluster, so excluding them keeps one control per action.
const UNIFIED_ANNOTATION_EXCLUDE = ['text', 'line', 'image', 'sticky', 'table']
const annotationExclude = computed(() =>
  isUnified.value ? [...ALWAYS_EXCLUDE, ...UNIFIED_ANNOTATION_EXCLUDE] : ALWAYS_EXCLUDE,
)
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
      <!-- NAVIGATION: everything that moves you around the diagram or changes how
           you see it, without writing anything to it (#460). Select / Hand / Laser,
           then zoom, then guides.
           Undo/redo stay keyboard-only (⌘Z / ⇧⌘Z) — no button.
           The laser is not navigation, but it leaves nothing on the canvas, so it
           belongs with the pointers rather than with the tools that write to the
           document — the reasoning already recorded at PointerGroup.vue:6-10.
           Guides hides itself on a whiteboard (GuidesGroup.vue:19), so this section
           carries two controls there and three everywhere else. -->
      <PointerGroup />
      <ZoomGroup />
      <GuidesGroup />

      <!-- CREATION: the tools that put something on the canvas. Wrapped with its
           leading separator so the two go together — a legacy mind map or flowchart
           has neither, and an unconditional separator would leave two hairlines side
           by side with nothing between.
           The eraser stays here beside Draw. It reads like editing, but Editing
           below is the contextual run that only appears with a selection, and the
           eraser is a persistent mode with no selection behind it — it would vanish
           whenever nothing was selected. -->
      <template v-if="isCreateCanvas || showsAnnotationTools">
        <ToolbarSeparator />
        <InsertGroups v-if="isCreateCanvas" />
        <WhiteboardTools v-if="showsAnnotationTools" :exclude="annotationExclude" />
      </template>

      <!-- EDITING: everything below follows the selection, and it grows off the END
           of the fixed prefix rather than out of its middle. That is the whole point
           of the arrangement: no control the user is reaching for moves sideways when
           the selection changes, which is what the eight floating bars did on every
           click.
           Moving Zoom and Guides to the front is what removes the cost this comment
           used to record — they sat at the growth point, so a selection pushed them
           mid-bar. They now land before it and never move. -->
      <template v-if="connectorSelected">
        <ToolbarSeparator />
        <LineGroup :connector="connector" />
      </template>

      <template v-else-if="shapeSelected">
        <ToolbarSeparator />
        <template v-if="!editing">
          <!-- A migrated flowchart node (free-floating #122) gets its type swap
               here, alongside the generic Fill/Border every shape already has —
               chromeType resolves it to 'block' chrome, so FlowchartNodeGroup
               below (which reads the legacy sub-model) never sees it (#410). -->
          <FlowchartNodeTypeGroup :shapes="shapes" />
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
        <ToolbarSeparator />
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
    </TooltipProvider>
  </div>
</template>
