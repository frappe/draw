<script setup>
// Per-node mind-map controls (#362): the text marks and size, the node shape and
// marker, the cross-link, focus mode, and delete.
//
// Everything except delete is single-selection only — a shape or a marker for
// "these four nodes" is not a thing the model expresses.
import { computed } from 'vue'
import { Popover } from 'frappe-ui'
import { useMindmapSelection } from '@/composables/useMindmapSelection.js'
import { mindmapUi, selectedNodeId, toggleFocus, focusedNodeId } from '@/stores/mindmapUi.js'
import { requestDelete } from '@/composables/useMindmapKeys.js'
import ToolbarButton from '../ToolbarButton.vue'
import ToolbarSeparator from '../ToolbarSeparator.vue'

const { store, model, node, multi, selectedIsRoot, canDelete } = useMindmapSelection()

const MIN_FONT = 10
const MAX_FONT = 48
const MARKS = [
  { name: 'bold', label: 'Bold', icon: 'lucide-bold' },
  { name: 'italic', label: 'Italic', icon: 'lucide-italic' },
  { name: 'strike', label: 'Strikethrough', icon: 'lucide-strikethrough' },
]
const SHAPES = [
  { value: 'pill', label: 'Pill' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'hexagon', label: 'Hexagon' },
]
// Complete lucide utility classes, never assembled from the marker name.
// Tailwind's JIT only emits classes it can read literally in the source, so
// `lucide-${name}` yields no CSS and every marker renders blank.
const MARKERS = [
  { name: 'star', label: 'Star', icon: 'lucide-star' },
  { name: 'flag', label: 'Flag', icon: 'lucide-flag' },
  { name: 'circle-check', label: 'Done', icon: 'lucide-circle-check' },
  { name: 'circle-alert', label: 'Alert', icon: 'lucide-circle-alert' },
  { name: 'heart', label: 'Heart', icon: 'lucide-heart' },
  { name: 'zap', label: 'Zap', icon: 'lucide-zap' },
  { name: 'bookmark', label: 'Bookmark', icon: 'lucide-bookmark' },
  { name: 'bell', label: 'Bell', icon: 'lucide-bell' },
  { name: 'target', label: 'Target', icon: 'lucide-target' },
  { name: 'lightbulb', label: 'Idea', icon: 'lucide-lightbulb' },
  { name: 'sparkles', label: 'Sparkles', icon: 'lucide-sparkles' },
  { name: 'clock', label: 'Clock', icon: 'lucide-clock' },
  { name: 'rocket', label: 'Rocket', icon: 'lucide-rocket' },
  { name: 'trophy', label: 'Trophy', icon: 'lucide-trophy' },
  { name: 'flame', label: 'Flame', icon: 'lucide-flame' },
  { name: 'thumbs-up', label: 'Thumbs up', icon: 'lucide-thumbs-up' },
  { name: 'gift', label: 'Gift', icon: 'lucide-gift' },
  { name: 'eye', label: 'Eye', icon: 'lucide-eye' },
]

const fontSize = computed(() => node.value?.fontSize ?? (selectedIsRoot.value ? 17 : 14))
// Focus counts as on only while the focused node still exists — the same guard
// the node layer applies, so the control can never claim a focus that dims
// nothing.
const isFocused = computed(() => !!focusedNodeId(model.value))

function patch(fields) {
  const id = selectedNodeId(store)
  if (id) store.updateNode(id, fields)
}

function toggleMark(name) {
  if (node.value) patch({ [name]: !node.value[name] })
}

function stepFontSize(delta) {
  patch({ fontSize: Math.max(MIN_FONT, Math.min(MAX_FONT, fontSize.value + delta)) })
}

function setMarker(icon) {
  patch({ marker: { icon: node.value?.marker?.icon === icon ? null : icon } })
}

// Toggling: pressing it again cancels, so "click a target node" is never a
// one-way trap.
function startCrosslink() {
  mindmapUi.pendingLinkSource = mindmapUi.pendingLinkSource ? null : selectedNodeId(store)
}

// Routed through the same path as the keyboard Delete, so a node with
// sub-branches raises the confirm dialog instead of silently taking the subtree.
function removeNode() {
  requestDelete(store)
}
</script>

<template>
  <template v-if="node">
    <ToolbarButton
      v-for="mark in MARKS"
      :key="mark.name"
      :label="mark.label"
      :icon="mark.icon"
      :active="Boolean(node[mark.name])"
      @click="toggleMark(mark.name)"
    />

    <div class="flex items-center rounded-md border border-outline-gray-2">
      <ToolbarButton class="!w-6" label="Decrease text size" icon="lucide-minus" @click="stepFontSize(-1)" />
      <span class="w-7 text-center text-sm tabular-nums text-ink-gray-8">{{ fontSize }}</span>
      <ToolbarButton class="!w-6" label="Increase text size" icon="lucide-plus" @click="stepFontSize(1)" />
    </div>

    <ToolbarSeparator />

    <Popover>
      <template #trigger><ToolbarButton label="Shape" icon="lucide-shapes" /></template>
      <template #default>
        <div class="w-[196px] p-2">
          <div class="mb-1 text-2xs font-semibold text-ink-gray-4">Shape</div>
          <div class="flex flex-wrap gap-1.5">
            <ToolbarButton
              v-for="shape in SHAPES"
              :key="shape.value"
              :label="shape.label"
              :active="(node.shape || 'pill') === shape.value"
              @click="patch({ shape: shape.value })"
            >
              <template #icon>
                <svg width="22" height="14" viewBox="0 0 22 14">
                  <rect v-if="shape.value === 'pill'" x="1" y="2" width="20" height="10" rx="5" fill="none" stroke="currentColor" stroke-width="1.3" />
                  <rect v-else-if="shape.value === 'rounded'" x="1" y="2" width="20" height="10" rx="3" fill="none" stroke="currentColor" stroke-width="1.3" />
                  <ellipse v-else-if="shape.value === 'ellipse'" cx="11" cy="7" rx="10" ry="6" fill="none" stroke="currentColor" stroke-width="1.3" />
                  <polygon v-else-if="shape.value === 'diamond'" points="11,1 21,7 11,13 1,7" fill="none" stroke="currentColor" stroke-width="1.3" />
                  <polygon v-else points="4,1 18,1 21,7 18,13 4,13 1,7" fill="none" stroke="currentColor" stroke-width="1.3" />
                </svg>
              </template>
            </ToolbarButton>
          </div>
        </div>
      </template>
    </Popover>

    <Popover>
      <template #trigger>
        <ToolbarButton label="Marker" icon="lucide-star" :active="Boolean(node.marker?.icon)" />
      </template>
      <template #default>
        <div class="w-[172px] p-2">
          <div class="mb-1 text-2xs font-semibold text-ink-gray-4">Marker</div>
          <div class="flex flex-wrap gap-1.5">
            <ToolbarButton
              v-for="marker in MARKERS"
              :key="marker.name"
              :label="marker.label"
              :icon="marker.icon"
              :active="node.marker?.icon === marker.name"
              @click="setMarker(marker.name)"
            />
          </div>
        </div>
      </template>
    </Popover>

    <ToolbarSeparator />

    <ToolbarButton
      label="Link to node"
      :tooltip="mindmapUi.pendingLinkSource ? 'Click a target node…' : 'Link to node'"
      icon="lucide-link-2"
      :active="Boolean(mindmapUi.pendingLinkSource)"
      @click="startCrosslink"
    />
    <ToolbarButton
      label="Focus this branch"
      :tooltip="isFocused ? 'Exit focus' : 'Focus this branch'"
      icon="lucide-crosshair"
      :active="isFocused"
      @click="toggleFocus(store)"
    />
  </template>

  <template v-if="canDelete">
    <ToolbarSeparator />
    <ToolbarButton
      :label="multi ? 'Delete nodes' : 'Delete node'"
      icon="lucide-trash-2"
      theme="red"
      @click="removeNode"
    />
  </template>
</template>
