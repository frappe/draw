<script setup>
// Home empty state — a welcoming hero shown when there are no diagrams yet. One
// canvas does everything now (canvas unification), so it's a single "New diagram"
// start (no type picker) plus a quieter "new folder".
import LucideIcon from '@/icons/LucideIcon.vue'
import { Button } from 'frappe-ui'

defineEmits(['create', 'new-folder'])
</script>

<template>
  <div class="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
    <!-- Decorative stacked-canvas mark. -->
    <div class="relative mb-6 h-16 w-16">
      <div class="absolute inset-0 rotate-6 rounded-2xl border border-outline-gray-2 bg-surface-gray-1" />
      <div class="absolute inset-0 -rotate-6 rounded-2xl border border-outline-gray-2 bg-surface-base" />
      <div class="absolute inset-0 flex items-center justify-center">
        <LucideIcon name="feather" class="h-7 w-7 text-ink-gray-6" />
      </div>
    </div>

    <h2 class="text-lg font-semibold text-ink-gray-9">Create your first diagram</h2>
    <p class="mt-1 text-[13px] text-ink-gray-5">
      One canvas for diagrams, mind maps, flowcharts & sketches — just start drawing.
    </p>

    <!-- One canvas does it all: a single start, straight to the blank canvas. -->
    <Button class="mt-6" variant="solid" size="lg" @click="$emit('create')">
      <template #prefix><LucideIcon name="plus" class="h-4 w-4" /></template>
      New diagram
    </Button>

    <button
      class="mt-5 flex items-center gap-1.5 text-[13px] font-medium text-ink-gray-5 hover:text-ink-gray-8"
      @click="$emit('new-folder')"
    >
      <LucideIcon name="folder-plus" class="h-4 w-4" />
      or create a folder
    </button>
  </div>
</template>
