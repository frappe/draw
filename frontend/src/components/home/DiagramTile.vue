<script setup>
// One diagram tile (README "Home dashboard"): thumbnail area + footer (title +
// meta + ⋯ menu). Stub: placeholder thumbnail; the feature agent renders the
// live SVG preview and the context menu.
import { FeatherIcon } from 'frappe-ui'

defineProps({
  diagram: { type: Object, required: true },
})
defineEmits(['open'])
</script>

<template>
  <button
    class="group overflow-hidden rounded-xl border border-outline-gray-1 bg-surface-white text-left"
    @click="$emit('open', diagram.name)"
  >
    <div class="flex h-[120px] items-center justify-center border-b border-outline-gray-1 bg-surface-white">
      <FeatherIcon name="image" class="h-7 w-7 text-ink-gray-3" />
    </div>
    <div class="flex items-center gap-1 px-3 py-2.5">
      <div class="min-w-0 flex-1">
        <div class="truncate text-[13px] font-semibold text-ink-gray-9">{{ diagram.title }}</div>
        <div class="text-[11px] text-ink-gray-5">{{ diagram.canvas_size }}</div>
      </div>
      <span class="opacity-0 group-hover:opacity-100">
        <FeatherIcon name="more-horizontal" class="h-4 w-4 text-ink-gray-5" />
      </span>
    </div>
  </button>
</template>
