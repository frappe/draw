<script setup>
// Floating contextual toolbar for a selected flowchart node — replaces the right
// palette's per-node controls (type swap, fill, decision branches, delete). Map-
// wide layout actions live in the bottom palette. Positioned above the node,
// tracking pan/zoom. Mounted once per editor (EditorShell).
import { computed } from 'vue'
import { Popover, Tooltip } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useCanvasToolbarStyle } from '@/composables/useCanvasToolbarStyle.js'
import {
  NODE_TYPES,
  NODE_TYPE_META,
  nodeSize,
  flowchartNodeById,
  swapNodeType,
  addDecisionBranch,
  removeDecisionBranch,
} from '@/diagram/flowchartModel.js'

const store = useDiagramStore()

const FILL_SWATCHES = ['#EFF6FF', '#F4FFF6', '#FDFAED', '#FCEAF5', '#F3F3F3', '#FFFFFF']
const TYPE_ICONS = {
  terminator: 'circle-play', process: 'square', decision: 'git-branch',
  inputOutput: 'log-in', document: 'file-text', database: 'database',
  predefinedProcess: 'columns-2', manualInput: 'type', preparation: 'hexagon',
  offPageRef: 'pentagon', connector: 'circle',
}

const model = computed(() => store.state.flowchart)
// Every selected flowchart node (Fill + Delete act on all of them).
const nodes = computed(() =>
  (store.state.selection || []).map((id) => flowchartNodeById(model.value, id)).filter(Boolean),
)
// Type-swap + branch controls only make sense for a lone selection.
const node = computed(() => (nodes.value.length === 1 ? nodes.value[0] : null))
const fillPreview = computed(() => nodes.value[0]?.fill || '#FFFFFF')

function nodeBox(n) {
  const size = nodeSize(n)
  return { x: n.x, y: n.y, w: size.w, h: size.h }
}

// Combined bounding box of all selected nodes, so the toolbar sits above the group.
const box = computed(() => {
  if (!nodes.value.length) return null
  const boxes = nodes.value.map(nodeBox)
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  const right = Math.max(...boxes.map((b) => b.x + b.w))
  const bottom = Math.max(...boxes.map((b) => b.y + b.h))
  return { x, y, w: right - x, h: bottom - y }
})

const style = useCanvasToolbarStyle(box)

function swap(type) {
  if (node.value) store.updateFlowchartModel('Swap node type', (m) => swapNodeType(m, node.value.id, type))
}
function setFill(color) {
  const ids = nodes.value.map((n) => n.id)
  if (!ids.length) return
  // Recolour every selected node as one undoable unit (Part G6).
  store.updateFlowchartModel('Fill', (m) => {
    for (const id of ids) {
      const target = flowchartNodeById(m, id)
      if (target) target.fill = color
    }
  })
}
function setBranchLabel(port, label) {
  if (!node.value) return
  const id = node.value.id
  store.updateFlowchartModel('Branch label', (m) => {
    const target = flowchartNodeById(m, id)
    if (!target) return
    target.branches = target.branches.map((b) => (b.port === port ? { ...b, label } : b))
    for (const edge of m.edges) if (edge.from.nodeId === id && edge.from.port === port) edge.label = label
  })
}
function addBranch() {
  if (node.value) store.updateFlowchartModel('Add branch', (m) => addDecisionBranch(m, node.value.id))
}
function removeBranch(port) {
  if (node.value) store.updateFlowchartModel('Remove branch', (m) => removeDecisionBranch(m, node.value.id, port))
}
function remove() {
  // Delete every selected node (+ their edges) as one undoable unit.
  store.removeFlowchartNodes(nodes.value.map((n) => n.id))
}

const btn = 'flex h-8 w-8 items-center justify-center rounded-md text-ink-gray-7 hover:bg-surface-gray-2'
</script>

<template>
  <Teleport to="body">
    <div
      v-if="nodes.length && box"
      data-flow-toolbar
      class="fixed z-30 flex max-w-[50vw] -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-lg border border-outline-gray-2 bg-surface-base p-1 shadow-lg"
      :style="style"
    >
      <!-- Node type — single selection only. -->
      <Popover v-if="node" side="top">
        <template #target="{ togglePopover }">
          <Tooltip text="Node type">
            <button :class="btn" @mousedown.prevent @click="togglePopover()">
              <LucideIcon :name="TYPE_ICONS[node.nodeType]" class="h-4 w-4" />
            </button>
          </Tooltip>
        </template>
        <template #body-main>
          <div class="w-[196px] p-2">
            <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-4">Node type</div>
            <div class="grid grid-cols-5 gap-1.5">
              <button
                v-for="type in NODE_TYPES"
                :key="type"
                class="flex h-10 items-center justify-center rounded-md border hover:bg-surface-gray-1"
                :class="node.nodeType === type ? 'border-ink-gray-9 bg-surface-gray-2' : 'border-outline-gray-1'"
                :title="NODE_TYPE_META[type].label"
                @click="swap(type)"
              >
                <LucideIcon :name="TYPE_ICONS[type]" class="h-4 w-4 text-ink-gray-7" />
              </button>
            </div>
          </div>
        </template>
      </Popover>

      <!-- Fill -->
      <Popover side="top">
        <template #target="{ togglePopover }">
          <Tooltip text="Fill">
            <button :class="btn" @mousedown.prevent @click="togglePopover()">
              <span class="h-4 w-4 rounded-full border border-black/10" :style="{ background: fillPreview }" />
            </button>
          </Tooltip>
        </template>
        <template #body-main>
          <div class="w-[176px] p-2">
            <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-4">Fill</div>
            <div class="flex flex-wrap gap-2">
              <button v-for="c in FILL_SWATCHES" :key="c" class="h-7 w-7 rounded-md border border-outline-gray-2" :style="{ background: c }" @click="setFill(c)" />
            </div>
          </div>
        </template>
      </Popover>

      <!-- Decision branches — single selection only. -->
      <Popover v-if="node && node.nodeType === 'decision'" side="top">
        <template #target="{ togglePopover }">
          <Tooltip text="Branches">
            <button :class="btn" @mousedown.prevent @click="togglePopover()"><LucideIcon name="git-branch" class="h-4 w-4" /></button>
          </Tooltip>
        </template>
        <template #body-main>
          <div class="w-[236px] p-2">
            <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-4">Branches</div>
            <div class="flex flex-col gap-1.5">
              <div v-for="branch in node.branches" :key="branch.port" class="flex items-center gap-1.5">
                <input
                  :value="branch.label"
                  class="min-w-0 flex-1 rounded-md border border-outline-gray-2 px-2 py-1 text-[13px] text-ink-gray-8 outline-none focus:border-outline-gray-4"
                  @change="setBranchLabel(branch.port, $event.target.value)"
                />
                <button class="flex h-7 w-7 flex-none items-center justify-center rounded-md text-ink-gray-5 hover:bg-surface-gray-2" title="Remove branch" @click="removeBranch(branch.port)">
                  <LucideIcon name="x" class="h-4 w-4" />
                </button>
              </div>
              <button class="mt-1 flex items-center gap-1.5 text-[13px] text-ink-gray-6 hover:text-ink-gray-9" @click="addBranch">
                <LucideIcon name="plus" class="h-4 w-4" /> Add branch
              </button>
            </div>
          </div>
        </template>
      </Popover>

      <div class="mx-0.5 h-5 w-px bg-surface-gray-3" />
      <Tooltip text="Delete node">
        <button class="flex h-8 w-8 items-center justify-center rounded-md text-red-600 hover:bg-red-50" @mousedown.prevent @click="remove">
          <LucideIcon name="trash-2" class="h-4 w-4" />
        </button>
      </Tooltip>
    </div>
  </Teleport>
</template>
