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
import CanvasGroup from './groups/CanvasGroup.vue'
import StyleGroup from './groups/StyleGroup.vue'
import TextGroup from './groups/TextGroup.vue'
import ArrangeGroup from './groups/ArrangeGroup.vue'
import BlockActionsGroup from './groups/BlockActionsGroup.vue'
import LineGroup from './groups/LineGroup.vue'
import ToolbarSeparator from './ToolbarSeparator.vue'

const { chromeType } = useSelectionContext()
const { connector, hasShapes, count, editing } = useBlockSelection()

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
</script>

<template>
  <div
    data-canvas-toolbar
    data-slot="fixed-menu"
    class="flex h-10 flex-none items-center gap-1 overflow-x-auto border-b border-outline-gray-1 bg-surface-base px-3"
  >
    <TooltipProvider>
      <div class="flex min-w-0 flex-1 items-center gap-1">
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
      </div>

      <CanvasGroup />
    </TooltipProvider>
  </div>
</template>
