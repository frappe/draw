<script setup>
// One creation-palette tool button (38x38, spec §4.2 / README 4b). Click arms
// draw mode; dragging the button starts a drag-and-drop onto the canvas. Active
// tool gets bg-surface-gray-2 + ink-9. Tooltip shows the name.
import { Tooltip } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'

defineProps({
  icon: { type: String, required: true },
  label: { type: String, required: true },
  active: { type: Boolean, default: false },
  draggable: { type: Boolean, default: false },
})
defineEmits(['select', 'dragstart'])
</script>

<template>
  <Tooltip :text="label">
    <button
      class="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-md text-ink-gray-7 transition-colors hover:bg-surface-gray-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-outline-blue-2"
      :class="active ? 'bg-surface-gray-2 text-ink-gray-9' : ''"
      :aria-label="label"
      :aria-pressed="active"
      :draggable="draggable"
      @click="$emit('select')"
      @dragstart="$emit('dragstart', $event)"
    >
      <LucideIcon :name="icon" class="h-[19px] w-[19px]" />
    </button>
  </Tooltip>
</template>
