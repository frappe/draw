<script setup>
// Whole-chart layout actions for a FREE-FLOATING flowchart on the unified canvas
// (#98). Standalone flowchart docs get Tidy up / flip direction / number steps from
// the bottom palette's isFlowchart branch, but a migrated flowchart node is an
// ordinary shape, so those actions had no home once the frame dissolved. This bar
// surfaces the same three actions whenever a flowchart node ('flowchart-node') is
// selected, wired to the free-floating shape layout op (store.applyFlowchartShapeLayout).
//
// It sits pinned to the top-centre of the canvas rather than above the selection:
// the selected shape already shows the block selection editor there, and these are
// map-wide actions (they re-flow the whole chart), not per-node edits.
import { computed } from 'vue'
import { Tooltip } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { isFlowchartShape } from '@/diagram/freeFloating.js'
import { flowchartDirectionOfShapes } from '@/diagram/freeFloatingOps.js'
import { tidyLayout, toggleDirection } from '@/diagram/flowchartLayout.js'
import { autoNumberFlow } from '@/diagram/flowchartModel.js'

const store = useDiagramStore()
const editorUi = useEditorUi()

// Show only while a migrated flowchart node is selected.
const active = computed(() =>
  (store.state.selection || []).some((id) => isFlowchartShape(store.shapeById(id))),
)

// Direction + numbered are whole-graph properties, read off the shapes' tags.
const direction = computed(() => flowchartDirectionOfShapes(store.state.shapes))
const numbered = computed(() =>
  store.state.shapes.some((s) => isFlowchartShape(s) && s.flowchart?.stepPrefix),
)

function tidy() {
  editorUi.pulseLayoutAnimation()
  store.applyFlowchartShapeLayout('Tidy up', (m) => tidyLayout(m))
}
function flip() {
  editorUi.pulseLayoutAnimation()
  store.applyFlowchartShapeLayout('Flow direction', (m) => toggleDirection(m))
}
function number() {
  store.applyFlowchartShapeLayout('Number steps', (m) => autoNumberFlow(m))
}

const btn =
  'flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] text-ink-gray-7 hover:bg-surface-gray-2'
</script>

<template>
  <Teleport to="body">
    <div
      v-if="active"
      data-flow-layout-toolbar
      class="fixed left-1/2 top-[14px] z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-outline-gray-2 bg-surface-base p-1 shadow-lg"
    >
      <Tooltip text="Tidy up — re-flow the whole chart">
        <button :class="btn" @click="tidy">
          <LucideIcon name="grid" class="h-4 w-4" />
          <span>Tidy up</span>
        </button>
      </Tooltip>
      <Tooltip :text="direction === 'TB' ? 'Flow left → right' : 'Flow top → bottom'">
        <button :class="btn" @click="flip">
          <LucideIcon :name="direction === 'TB' ? 'arrow-right' : 'arrow-down'" class="h-4 w-4" />
          <span>Flip</span>
        </button>
      </Tooltip>
      <Tooltip :text="numbered ? 'Clear step numbers' : 'Number the steps'">
        <button :class="[btn, numbered && 'bg-surface-gray-3 text-ink-gray-9']" @click="number">
          <LucideIcon name="list" class="h-4 w-4" />
          <span>Number</span>
        </button>
      </Tooltip>
    </div>
  </Teleport>
</template>
