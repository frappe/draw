<script setup>
// Floating contextual toolbar for a selected flowchart node — replaces the right
// palette's per-node controls (type swap, fill, decision branches, delete). Map-
// wide layout actions live in the bottom palette. Positioned above the node,
// tracking pan/zoom. Mounted once per editor (EditorShell).
import { computed } from 'vue'
import { Button, Popover, TextInput } from 'frappe-ui'
import SwatchGrid from '@/components/floating/SwatchGrid.vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useCanvasToolbarStyle } from '@/composables/useCanvasToolbarStyle.js'
import { isDragging } from '@/composables/useShapeTransform.js'
import { unionBounds } from '@/diagram/geometry.js'
import { SWATCH_PALETTE } from '@/diagram/palette.js'
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

// Per-type icons for the picker grid (these SHOULD differ per type). The toolbar
// trigger uses one standardized icon instead of mirroring the node.
// Complete lucide utility classes, not bare names: Tailwind's JIT only emits
// classes it can read literally, so `lucide-${name}` yields no CSS at all.
const TYPE_ICONS = {
  terminator: 'lucide-circle-play', process: 'lucide-square', decision: 'lucide-git-branch',
  inputOutput: 'lucide-log-in', document: 'lucide-file-text', database: 'lucide-database',
  predefinedProcess: 'lucide-columns-2', manualInput: 'lucide-type', preparation: 'lucide-hexagon',
  offPageRef: 'lucide-pentagon', connector: 'lucide-circle',
}

const model = computed(() => store.state.flowchart)
// Every selected flowchart node (Fill + Delete act on all of them).
const nodes = computed(() =>
  (store.state.selection || []).map((id) => flowchartNodeById(model.value, id)).filter(Boolean),
)
// Type-swap + branch controls only make sense for a lone selection.
const node = computed(() => (nodes.value.length === 1 ? nodes.value[0] : null))
const fillPreview = computed(() => nodes.value[0]?.fill || '#FFFFFF')
const borderPreview = computed(() => nodes.value[0]?.border || '#7C7C7C')

function nodeBox(n) {
  const size = nodeSize(n)
  return { x: n.x, y: n.y, w: size.w, h: size.h }
}

// Combined bounding box of all selected nodes, so the toolbar sits above the group.
const box = computed(() => unionBounds(nodes.value.map(nodeBox)))

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
function setBorder(color) {
  const ids = nodes.value.map((n) => n.id)
  if (!ids.length) return
  // Border is its own field (null clears back to the theme default outline).
  store.updateFlowchartModel('Border', (m) => {
    for (const id of ids) {
      const target = flowchartNodeById(m, id)
      if (target) target.border = color
    }
  })
}
// Per-node text formatting (consistent with block/mind-map): size, bold,
// italic, alignment — applied to every selected node as one undoable unit.
const tstyle = computed(() => node.value?.textStyle || {})
function setTextStyle(patch) {
  const ids = nodes.value.map((n) => n.id)
  if (!ids.length) return
  store.updateFlowchartModel('Text style', (m) => {
    for (const id of ids) {
      const target = flowchartNodeById(m, id)
      if (target) target.textStyle = { ...(target.textStyle || {}), ...patch }
    }
  })
}
const fontSize = computed(() => tstyle.value.size || 14)
function stepFontSize(d) {
  setTextStyle({ size: Math.max(8, Math.min(72, fontSize.value + d)) })
}
function toggleMark(name) {
  setTextStyle({ [name]: !tstyle.value[name] })
}
function setTextAlign(a) {
  setTextStyle({ align: a })
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

</script>

<template>
  <Teleport to="body">
    <div
      v-if="nodes.length && box && !isDragging"
      data-flow-toolbar
      class="fixed z-30 flex max-w-[50vw] -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-lg border border-outline-gray-2 bg-surface-base p-1 shadow-lg"
      :style="style"
    >
      <!-- Node type — single selection only. -->
      <Popover v-if="node" side="top">
        <template #target="{ togglePopover }">
          <Button variant="ghost" theme="gray" size="md" icon="lucide-shapes" tooltip="Node type" label="Node type" @mousedown.prevent @click="togglePopover()" />
        </template>
        <template #body-main>
          <div class="w-[196px] p-2">
            <div class="mb-1 text-2xs font-semibold text-ink-gray-4">Node type</div>
            <div class="grid grid-cols-5 gap-1.5">
              <Button
                v-for="type in NODE_TYPES"
                :key="type"
                class="!w-full"
                size="lg"
                theme="gray"
                :variant="node.nodeType === type ? 'subtle' : 'outline'"
                :icon="TYPE_ICONS[type]"
                :tooltip="NODE_TYPE_META[type].label"
                :label="NODE_TYPE_META[type].label"
                @click="swap(type)"
              />
            </div>
          </div>
        </template>
      </Popover>

      <!-- Fill -->
      <Popover side="top">
        <template #target="{ togglePopover }">
          <Button variant="ghost" theme="gray" size="md" tooltip="Fill" label="Fill" @mousedown.prevent @click="togglePopover()">
            <template #icon>
              <span class="h-4 w-4 rounded-full border border-outline-gray-2" :style="{ background: fillPreview }" />
            </template>
          </Button>
        </template>
        <template #body-main>
          <div class="w-[204px] p-2">
            <div class="mb-1.5 text-2xs font-semibold text-ink-gray-4">Fill</div>
            <SwatchGrid :colors="SWATCH_PALETTE" shape="square" class="mb-2" @select="setFill" />
            <Button class="w-full" variant="outline" theme="gray" size="sm" label="No fill" @click="setFill('none')" />
          </div>
        </template>
      </Popover>

      <!-- Border — its own menu, rendered as rings so it reads as a border. -->
      <Popover side="top">
        <template #target="{ togglePopover }">
          <Button variant="ghost" theme="gray" size="md" tooltip="Border" label="Border" @mousedown.prevent @click="togglePopover()">
            <template #icon>
              <span class="h-4 w-4 rounded-full border-[3px]" :style="{ borderColor: borderPreview }" />
            </template>
          </Button>
        </template>
        <template #body-main>
          <div class="w-[204px] p-2">
            <div class="mb-1.5 text-2xs font-semibold text-ink-gray-4">Border</div>
            <SwatchGrid :colors="SWATCH_PALETTE" shape="ring" class="mb-2" @select="setBorder" />
            <Button class="w-full" variant="outline" theme="gray" size="sm" label="Default border" @click="setBorder(null)" />
          </div>
        </template>
      </Popover>

      <div class="mx-0.5 h-5 w-px bg-surface-gray-3" />

      <!-- Text formatting inline (consistent with block diagrams): size, bold,
           italic, alignment. -->
      <div class="flex items-center rounded-md border border-outline-gray-2">
        <Button variant="ghost" theme="gray" size="md" class="!w-6" icon="lucide-minus" label="Decrease font size" @click="stepFontSize(-1)" />
        <span class="w-6 text-center text-sm tabular-nums text-ink-gray-8">{{ fontSize }}</span>
        <Button variant="ghost" theme="gray" size="md" class="!w-6" icon="lucide-plus" label="Increase font size" @click="stepFontSize(1)" />
      </div>
      <Button :variant="tstyle.bold ? 'subtle' : 'ghost'" theme="gray" size="md" icon="lucide-bold" tooltip="Bold" label="Bold" @click="toggleMark('bold')" />
      <Button :variant="tstyle.italic ? 'subtle' : 'ghost'" theme="gray" size="md" icon="lucide-italic" tooltip="Italic" label="Italic" @click="toggleMark('italic')" />
      <Button :variant="tstyle.strike ? 'subtle' : 'ghost'" theme="gray" size="md" icon="lucide-strikethrough" tooltip="Strikethrough" label="Strikethrough" @click="toggleMark('strike')" />
      <Button :variant="(tstyle.align || 'center') === 'left' ? 'subtle' : 'ghost'" theme="gray" size="md" icon="lucide-text-align-start" tooltip="Align left" label="Align left" @click="setTextAlign('left')" />
      <Button :variant="(tstyle.align || 'center') === 'center' ? 'subtle' : 'ghost'" theme="gray" size="md" icon="lucide-text-align-center" tooltip="Align center" label="Align center" @click="setTextAlign('center')" />
      <Button :variant="(tstyle.align || 'center') === 'right' ? 'subtle' : 'ghost'" theme="gray" size="md" icon="lucide-text-align-end" tooltip="Align right" label="Align right" @click="setTextAlign('right')" />

      <!-- Decision branches — single selection only. -->
      <Popover v-if="node && node.nodeType === 'decision'" side="top">
        <template #target="{ togglePopover }">
          <Button variant="ghost" theme="gray" size="md" icon="lucide-git-branch" tooltip="Branches" label="Branches" @mousedown.prevent @click="togglePopover()" />
        </template>
        <template #body-main>
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
                <Button class="flex-none" variant="ghost" theme="gray" size="sm" icon="lucide-x" tooltip="Remove branch" label="Remove branch" @click="removeBranch(branch.port)" />
              </div>
              <Button class="mt-1 self-start" variant="ghost" theme="gray" size="sm" icon-left="lucide-plus" label="Add branch" @click="addBranch" />
            </div>
          </div>
        </template>
      </Popover>

      <div class="mx-0.5 h-5 w-px bg-surface-gray-3" />
      <Button variant="ghost" theme="red" size="md" icon="lucide-trash-2" tooltip="Delete node" label="Delete node" @mousedown.prevent @click="remove" />
    </div>
  </Teleport>
</template>
