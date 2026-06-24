<script setup>
// Compact node-type picker (spec diagram-types B4/F2). Shown when a "+" handle is
// clicked or a connector is dragged to empty canvas; choosing a type creates that
// node connected one level down. Rendered inside a <foreignObject> in the canvas
// layer so it tracks the viewport transform (Part G4). frappe-ui chrome tokens.
import { FeatherIcon } from 'frappe-ui'
import { NODE_TYPES, NODE_TYPE_META } from '@/diagram/flowchartModel.js'

defineEmits(['choose', 'close'])

// Curated icon per node type (Feather names) for the picker rows.
const ICONS = {
  terminator: 'play-circle',
  process: 'square',
  decision: 'git-branch',
  inputOutput: 'log-in',
  connector: 'circle',
}

const options = NODE_TYPES.map((type) => ({
  type,
  label: NODE_TYPE_META[type].label,
  icon: ICONS[type],
}))
</script>

<template>
  <div
    class="w-44 rounded-lg border border-outline-gray-2 bg-surface-white py-1 shadow-2xl"
    @pointerdown.stop
    @pointerup.stop
  >
    <div class="px-2.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-5">
      Add node
    </div>
    <button
      v-for="option in options"
      :key="option.type"
      class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] text-ink-gray-8 hover:bg-surface-gray-2"
      @click="$emit('choose', option.type)"
    >
      <FeatherIcon :name="option.icon" class="h-4 w-4 text-ink-gray-6" />
      {{ option.label }}
    </button>
  </div>
</template>
