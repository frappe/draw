<script setup>
// Fill, branch colour, border and connector style for a selected mind-map node
// (#362). All three colours draw from the same Espresso/Frappe swatch family and
// each is independent, so a node can be white-filled with a green branch and a
// bold dark border.
import { computed } from 'vue'
import { Popover } from 'frappe-ui'
import SwatchGrid from '@/components/floating/SwatchGrid.vue'
import { useMindmapSelection } from '@/composables/useMindmapSelection.js'
import { isRoot } from '@/diagram/mindmapModel.js'
import { SWATCH_PALETTE } from '@/diagram/palette.js'
import ToolbarButton from '../ToolbarButton.vue'

const { store, model, nodes, hasNonRootSelected, fillPreview, branchPreview, borderPreview } =
  useMindmapSelection()

const DASHES = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
]
const DASH_ARRAY = { solid: '0', dashed: '5 3', dotted: '1.5 3' }
const linkDash = computed(() => nodes.value[0]?.linkDash || 'solid')

// Each colour is its own field; null clears the override back to the branch tint.
function setFill(fill) {
  for (const node of nodes.value) store.updateNode(node.id, { fill })
}
function setColor(color) {
  for (const node of nodes.value) store.updateNode(node.id, { color })
}
function setBorder(border) {
  for (const node of nodes.value) store.updateNode(node.id, { border })
}

// Line style of the branch coming INTO each selected node. The root has none, so
// it is skipped rather than given a style that draws nothing.
function setLinkDash(dash) {
  for (const node of nodes.value) {
    if (!isRoot(model.value, node.id)) store.updateNode(node.id, { linkDash: dash })
  }
}
</script>

<template>
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
        <ToolbarButton class="w-full" label="Match branch" @click="setFill(null)" />
      </div>
    </template>
  </Popover>

  <Popover>
    <template #trigger>
      <ToolbarButton label="Branch colour">
        <template #icon>
          <span class="h-4 w-4 rounded-full border border-outline-gray-2" :style="{ background: branchPreview }" />
        </template>
      </ToolbarButton>
    </template>
    <template #default>
      <div class="w-[204px] p-2">
        <div class="mb-1.5 text-2xs font-semibold text-ink-gray-4">Branch</div>
        <SwatchGrid :colors="SWATCH_PALETTE" @select="setColor" />
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
        <ToolbarButton class="w-full" label="Match branch" @click="setBorder(null)" />
      </div>
    </template>
  </Popover>

  <Popover v-if="hasNonRootSelected">
    <template #trigger>
      <ToolbarButton label="Connector style">
        <template #icon>
          <svg width="18" height="12" viewBox="0 0 18 12">
            <line x1="1" y1="6" x2="17" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round" :stroke-dasharray="DASH_ARRAY[linkDash]" />
          </svg>
        </template>
      </ToolbarButton>
    </template>
    <template #default>
      <div class="w-[168px] p-2">
        <div class="mb-1.5 text-2xs font-semibold text-ink-gray-4">Connector</div>
        <div class="flex gap-1">
          <ToolbarButton
            v-for="dash in DASHES"
            :key="dash.value"
            class="flex-1"
            :label="dash.label"
            :active="linkDash === dash.value"
            @click="setLinkDash(dash.value)"
          >
            <template #icon>
              <svg width="26" height="10" viewBox="0 0 26 10">
                <line x1="2" y1="5" x2="24" y2="5" stroke="currentColor" stroke-width="2" stroke-linecap="round" :stroke-dasharray="DASH_ARRAY[dash.value]" />
              </svg>
            </template>
          </ToolbarButton>
        </div>
      </div>
    </template>
  </Popover>
</template>
