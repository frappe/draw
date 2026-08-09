<script setup>
// Controls for a selected flowchart node (#362): node type, fill, border, text
// formatting, the decision branches, and delete.
//
// Fill, border, text and delete act on every selected node as one undoable unit.
// Type swap and branches are single-selection only.
import { computed } from 'vue'
import { Popover, TextInput } from 'frappe-ui'
import SwatchGrid from '@/components/floating/SwatchGrid.vue'
import { useFlowchartSelection } from '@/composables/useFlowchartSelection.js'
import { SWATCH_PALETTE } from '@/diagram/palette.js'
import {
  NODE_TYPES,
  NODE_TYPE_META,
  flowchartNodeById,
  swapNodeType,
  addDecisionBranch,
  removeDecisionBranch,
} from '@/diagram/flowchartModel.js'
import ToolbarButton from '../ToolbarButton.vue'
import ToolbarSeparator from '../ToolbarSeparator.vue'

const { store, nodes, node, fillPreview, borderPreview, textStyle, updateSelectedNodes } =
  useFlowchartSelection()

// Complete lucide utility classes, not bare names: Tailwind's JIT only emits
// classes it can read literally, so `lucide-${name}` yields no CSS at all.
const TYPE_ICONS = {
  terminator: 'lucide-circle-play', process: 'lucide-square', decision: 'lucide-git-branch',
  inputOutput: 'lucide-log-in', document: 'lucide-file-text', database: 'lucide-database',
  predefinedProcess: 'lucide-columns-2', manualInput: 'lucide-type', preparation: 'lucide-hexagon',
  offPageRef: 'lucide-pentagon', connector: 'lucide-circle',
}
const MARKS = [
  { name: 'bold', label: 'Bold', icon: 'lucide-bold' },
  { name: 'italic', label: 'Italic', icon: 'lucide-italic' },
  { name: 'strike', label: 'Strikethrough', icon: 'lucide-strikethrough' },
]
const ALIGNMENTS = [
  { value: 'left', label: 'Align left', icon: 'lucide-text-align-start' },
  { value: 'center', label: 'Align center', icon: 'lucide-text-align-center' },
  { value: 'right', label: 'Align right', icon: 'lucide-text-align-end' },
]

const fontSize = computed(() => textStyle.value.size || 14)
const align = computed(() => textStyle.value.align || 'center')

function setTextStyle(patch) {
  updateSelectedNodes('Text style', (target) => {
    target.textStyle = { ...(target.textStyle || {}), ...patch }
  })
}

function swap(type) {
  if (node.value) store.updateFlowchartModel('Swap node type', (m) => swapNodeType(m, node.value.id, type))
}

function setFill(color) {
  updateSelectedNodes('Fill', (target) => {
    target.fill = color
  })
}

// Border is its own field; null clears back to the theme default outline.
function setBorder(color) {
  updateSelectedNodes('Border', (target) => {
    target.border = color
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
  store.removeFlowchartNodes(nodes.value.map((n) => n.id))
}
</script>

<template>
  <Popover v-if="node">
    <template #trigger><ToolbarButton label="Node type" icon="lucide-shapes" /></template>
    <template #default>
      <div class="w-[196px] p-2">
        <div class="mb-1 text-2xs font-semibold text-ink-gray-4">Node type</div>
        <div class="grid grid-cols-5 gap-1.5">
          <ToolbarButton
            v-for="type in NODE_TYPES"
            :key="type"
            :label="NODE_TYPE_META[type].label"
            :icon="TYPE_ICONS[type]"
            :active="node.nodeType === type"
            @click="swap(type)"
          />
        </div>
      </div>
    </template>
  </Popover>

  <Popover>
    <template #trigger>
      <ToolbarButton label="Fill">
        <template #icon>
          <span class="h-4 w-4 rounded-full border border-outline-gray-2" :style="{ background: fillPreview }" />
        </template>
      </ToolbarButton>
    </template>
    <template #default>
      <div class="w-[204px] p-2">
        <div class="mb-1.5 text-2xs font-semibold text-ink-gray-4">Fill</div>
        <SwatchGrid :colors="SWATCH_PALETTE" shape="square" class="mb-2" @select="setFill" />
        <ToolbarButton class="w-full" label="No fill" @click="setFill('none')" />
      </div>
    </template>
  </Popover>

  <Popover>
    <template #trigger>
      <ToolbarButton label="Border">
        <template #icon>
          <span class="h-4 w-4 rounded-full border-[3px]" :style="{ borderColor: borderPreview }" />
        </template>
      </ToolbarButton>
    </template>
    <template #default>
      <div class="w-[204px] p-2">
        <div class="mb-1.5 text-2xs font-semibold text-ink-gray-4">Border</div>
        <SwatchGrid :colors="SWATCH_PALETTE" shape="ring" class="mb-2" @select="setBorder" />
        <ToolbarButton class="w-full" label="Default border" @click="setBorder(null)" />
      </div>
    </template>
  </Popover>

  <ToolbarSeparator />

  <div class="flex items-center rounded-md border border-outline-gray-2">
    <ToolbarButton class="!w-6" label="Decrease font size" icon="lucide-minus" @click="setTextStyle({ size: Math.max(8, fontSize - 1) })" />
    <span class="w-7 text-center text-sm tabular-nums text-ink-gray-8">{{ fontSize }}</span>
    <ToolbarButton class="!w-6" label="Increase font size" icon="lucide-plus" @click="setTextStyle({ size: Math.min(72, fontSize + 1) })" />
  </div>

  <ToolbarButton
    v-for="mark in MARKS"
    :key="mark.name"
    :label="mark.label"
    :icon="mark.icon"
    :active="Boolean(textStyle[mark.name])"
    @click="setTextStyle({ [mark.name]: !textStyle[mark.name] })"
  />

  <ToolbarButton
    v-for="alignment in ALIGNMENTS"
    :key="alignment.value"
    :label="alignment.label"
    :icon="alignment.icon"
    :active="align === alignment.value"
    @click="setTextStyle({ align: alignment.value })"
  />

  <Popover v-if="node && node.nodeType === 'decision'">
    <template #trigger><ToolbarButton label="Branches" icon="lucide-git-branch" /></template>
    <template #default>
      <div class="w-[236px] p-2">
        <div class="mb-1 text-2xs font-semibold text-ink-gray-4">Branches</div>
        <div class="flex flex-col gap-1.5">
          <div v-for="branch in node.branches" :key="branch.port" class="flex items-center gap-1.5">
            <TextInput
              class="min-w-0 flex-1"
              variant="outline"
              :model-value="branch.label"
              :label="`Branch ${branch.port} label`"
              @update:model-value="setBranchLabel(branch.port, $event)"
            />
            <ToolbarButton class="flex-none" label="Remove branch" icon="lucide-x" @click="removeBranch(branch.port)" />
          </div>
          <ToolbarButton class="mt-1 self-start" label="Add branch" icon-left="lucide-plus" @click="addBranch" />
        </div>
      </div>
    </template>
  </Popover>

  <ToolbarSeparator />
  <ToolbarButton label="Delete node" icon="lucide-trash-2" theme="red" @click="remove" />
</template>
