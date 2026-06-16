<script setup>
// One-click action tile (48px, icon + 9px label, README 4d). Toggled tiles get
// a gray-900 border + bg-surface-gray-2.
import { FeatherIcon } from 'frappe-ui'

defineProps({
  icon: { type: String, required: true },
  label: { type: String, required: true },
  active: { type: Boolean, default: false },
})
defineEmits(['click'])
</script>

<template>
  <button
    class="flex h-12 flex-col items-center justify-center gap-1 rounded-md border bg-surface-white hover:border-outline-gray-3 hover:bg-surface-gray-1"
    :class="active ? 'border-ink-gray-9 bg-surface-gray-2' : 'border-outline-gray-1'"
    @click="$emit('click')"
  >
    <FeatherIcon :name="icon" class="h-[18px] w-[18px] text-ink-gray-7" />
    <span class="text-[9px] text-ink-gray-6">{{ label }}</span>
  </button>
</template>
