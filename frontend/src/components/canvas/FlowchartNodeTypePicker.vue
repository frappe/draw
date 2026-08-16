<script setup>
// Compact node-type picker (spec diagram-types B4/F2). Shown when a "+" handle is
// clicked or a connector is dragged to empty canvas; choosing a type creates that
// node connected one level down. Rendered inside a <foreignObject> in the canvas
// layer so it tracks the viewport transform (Part G4). frappe-ui chrome tokens.
import { Button } from 'frappe-ui'
import ShapeGlyph from '@/components/floating/ShapeGlyph.vue'
import { NODE_TYPES, NODE_TYPE_META } from '@/diagram/flowchartModel.js'

defineEmits(['choose', 'close'])

const options = NODE_TYPES.map((type) => ({
  type,
  label: NODE_TYPE_META[type].label,
}))
</script>

<template>
  <div
    data-fc-picker
    class="w-[372px] rounded-lg border border-outline-gray-2 bg-surface-base py-1 shadow-2xl"
    @pointerdown.stop
    @pointerup.stop
  >
    <div class="px-2.5 pb-1 pt-0.5 text-sm font-semibold text-ink-gray-5">
      Add node
    </div>
    <!-- Two columns, no scroll, no truncation — every type is visible at once and
         reads in full (#441 item 1; at the old 256px, four of the eleven names were
         clipped to "Input / Out…").
         The width is set by the longest label, "Predefined process", which measures
         138px at the Button's own text-base. Button wraps its slot in a `truncate`
         span, so the fix is to give that span room rather than to fight it: each
         column needs 138 + 16 (icon) + 8 (gap) + 16 (padding) = 178px. -->
    <div class="grid grid-cols-2 gap-0.5 px-1 pb-0.5">
      <Button
        v-for="option in options"
        :key="option.type"
        class="!w-full !justify-start"
        size="sm"
        theme="gray"
        variant="ghost"
        :label="option.label"
        @click="$emit('choose', option.type)"
      >
        <template #prefix>
          <ShapeGlyph family="flowchart" :type="option.type" class="size-4 flex-none text-ink-gray-6" />
        </template>
      </Button>
    </div>
  </div>
</template>
