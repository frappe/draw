<script setup>
// Flowchart right-palette (spec diagram-types Part B8). Tidy up, flow-direction
// toggle, node-type swap (preserving edges), node Fill/Border color, decision
// branch-label editing (+ add/remove branch), and theme presets. Acts on the
// single selected node where a node is needed; all edits go through the store's
// commit() mutations so each is one undoable unit (Part G6). frappe-ui chrome.
import { computed } from 'vue'
import { FeatherIcon } from 'frappe-ui'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import PaletteSection from './PaletteSection.vue'
import ActionTile from './ActionTile.vue'
import ThemePresetsSection from './ThemePresetsSection.vue'
import {
  NODE_TYPES,
  NODE_TYPE_META,
  flowchartNodeById,
  swapNodeType,
  addDecisionBranch,
  removeDecisionBranch,
} from '@/diagram/flowchartModel.js'
import { tidyLayout, toggleDirection } from '@/diagram/flowchartLayout.js'

const store = useDiagramStore()

const model = computed(() => store.state.flowchart)
const direction = computed(() => model.value?.direction || 'TB')

// The single selected node (palette node actions need exactly one).
const node = computed(() => {
  const ids = store.state.selection
  if (ids.length !== 1) return null
  return flowchartNodeById(model.value, ids[0]) || null
})

// Espresso-friendly node fill swatches (kept on-canvas literal colors, soft fills).
const FILL_SWATCHES = ['#EFF6FF', '#F4FFF6', '#FDFAED', '#FCEAF5', '#F3F3F3', '#FFFFFF']

function tidy() {
  store.updateFlowchartModel('Tidy up', (m) => tidyLayout(m))
}

function flip() {
  store.updateFlowchartModel('Flow direction', (m) => toggleDirection(m))
}

function swap(nodeType) {
  if (!node.value) return
  store.updateFlowchartModel('Swap node type', (m) => swapNodeType(m, node.value.id, nodeType))
}

function setFill(color) {
  if (node.value) store.updateFlowchartNode(node.value.id, { fill: color })
}

// Rename a decision branch: update the branch label AND every outgoing edge on
// that branch port within one undoable mutation, so the connector's midpoint
// label stays attached (spec B8/B11 "decision branch labels stay attached").
function setBranchLabel(port, label) {
  if (!node.value) return
  const id = node.value.id
  store.updateFlowchartModel('Branch label', (m) => {
    const target = flowchartNodeById(m, id)
    if (!target) return
    target.branches = target.branches.map((b) => (b.port === port ? { ...b, label } : b))
    for (const edge of m.edges) {
      if (edge.from.nodeId === id && edge.from.port === port) edge.label = label
    }
  })
}

function addBranch() {
  if (node.value) store.updateFlowchartModel('Add branch', (m) => addDecisionBranch(m, node.value.id))
}

function removeBranch(port) {
  if (node.value) store.updateFlowchartModel('Remove branch', (m) => removeDecisionBranch(m, node.value.id, port))
}

const TYPE_ICONS = {
  terminator: 'play-circle',
  process: 'square',
  decision: 'git-branch',
  inputOutput: 'log-in',
  connector: 'circle',
}
</script>

<template>
  <div>
    <PaletteSection label="Layout">
      <div class="grid grid-cols-2 gap-2">
        <ActionTile icon="grid" label="Tidy up" @click="tidy" />
        <ActionTile
          :icon="direction === 'TB' ? 'arrow-down' : 'arrow-right'"
          :label="direction === 'TB' ? 'Top → bottom' : 'Left → right'"
          @click="flip"
        />
      </div>
    </PaletteSection>

    <PaletteSection v-if="node" label="Node type">
      <div class="grid grid-cols-5 gap-1.5">
        <button
          v-for="type in NODE_TYPES"
          :key="type"
          class="flex h-10 items-center justify-center rounded-md border hover:bg-surface-gray-1"
          :class="node.nodeType === type ? 'border-ink-gray-9 bg-surface-gray-2' : 'border-outline-gray-1'"
          :title="NODE_TYPE_META[type].label"
          @click="swap(type)"
        >
          <FeatherIcon :name="TYPE_ICONS[type]" class="h-4 w-4 text-ink-gray-7" />
        </button>
      </div>
    </PaletteSection>

    <PaletteSection v-if="node" label="Fill">
      <div class="flex flex-wrap gap-2">
        <button
          v-for="color in FILL_SWATCHES"
          :key="color"
          class="h-7 w-7 rounded-md border border-outline-gray-2"
          :style="{ background: color }"
          @click="setFill(color)"
        />
      </div>
    </PaletteSection>

    <PaletteSection v-if="node && node.nodeType === 'decision'" label="Branches">
      <div class="flex flex-col gap-1.5">
        <div v-for="branch in node.branches" :key="branch.port" class="flex items-center gap-1.5">
          <input
            :value="branch.label"
            class="min-w-0 flex-1 rounded-md border border-outline-gray-2 px-2 py-1 text-[13px] text-ink-gray-8 outline-none focus:border-outline-gray-4"
            @change="setBranchLabel(branch.port, $event.target.value)"
          />
          <button
            class="flex h-7 w-7 flex-none items-center justify-center rounded-md text-ink-gray-5 hover:bg-surface-gray-2"
            title="Remove branch"
            @click="removeBranch(branch.port)"
          >
            <FeatherIcon name="x" class="h-4 w-4" />
          </button>
        </div>
        <button
          class="mt-1 flex items-center gap-1.5 text-[13px] text-ink-gray-6 hover:text-ink-gray-9"
          @click="addBranch"
        >
          <FeatherIcon name="plus" class="h-4 w-4" /> Add branch
        </button>
      </div>
    </PaletteSection>

    <ThemePresetsSection />
  </div>
</template>
