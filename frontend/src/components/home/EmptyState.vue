<script setup>
// Home empty state (spec §2): a single dotted create tile + hint text.
import LucideIcon from '@/icons/LucideIcon.vue'
defineEmits(['create'])
</script>

<template>
  <div class="flex flex-col items-start gap-3">
    <button
      class="flex h-[166px] w-[224px] flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-outline-gray-3 text-ink-gray-7 hover:bg-surface-gray-1"
      @click="$emit('create')"
    >
      <div class="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-surface-gray-2">
        <LucideIcon name="plus" class="h-5 w-5" />
      </div>
      <span class="text-[13px] font-semibold">New diagram</span>
    </button>
  </div>
</template>
