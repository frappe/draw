<script setup>
// Diagram tile grid (README "Home dashboard"): create tile first, then one
// DiagramTile per diagram. Empty state is handled by the parent via EmptyState.
import { FeatherIcon } from 'frappe-ui'
import DiagramTile from './DiagramTile.vue'

defineProps({
  diagrams: { type: Array, default: () => [] },
})
defineEmits(['create', 'open'])
</script>

<template>
  <div class="grid gap-[18px]" style="grid-template-columns: repeat(auto-fill, minmax(224px, 1fr))">
    <button
      class="flex h-[166px] flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-outline-gray-3 text-ink-gray-7 hover:bg-surface-gray-1"
      @click="$emit('create')"
    >
      <div class="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-surface-gray-2">
        <FeatherIcon name="plus" class="h-5 w-5" />
      </div>
      <span class="text-[13px] font-semibold">New diagram</span>
    </button>

    <DiagramTile
      v-for="diagram in diagrams"
      :key="diagram.name"
      :diagram="diagram"
      @open="$emit('open', $event)"
    />
  </div>
</template>
