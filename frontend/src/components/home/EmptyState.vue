<script setup>
// Home empty state — a welcoming hero shown when there are no diagrams yet.
// Offers a one-click start for each diagram type, plus a quieter "new folder".
import LucideIcon from '@/icons/LucideIcon.vue'
import { DIAGRAM_TYPES } from '@/data/diagramTypes.js'

defineEmits(['create', 'new-folder'])

const HINTS = {
  block: 'Boxes, arrows & flows',
  mindmap: 'Branch out ideas',
  flowchart: 'Steps & decisions',
  whiteboard: 'Freeform sketching',
}
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
    <p class="mt-1 text-[13px] text-ink-gray-5">Pick a type to start with a blank canvas — you can switch later.</p>

    <!-- One-click start per type. -->
    <div class="mt-6 grid w-full max-w-[560px] grid-cols-2 gap-3 sm:grid-cols-4">
      <button
        v-for="t in DIAGRAM_TYPES"
        :key="t.value"
        class="group flex flex-col items-center gap-2 rounded-xl border border-outline-gray-2 bg-surface-base p-4 transition-colors hover:border-ink-gray-9 hover:bg-surface-gray-1"
        @click="$emit('create', t.value)"
      >
        <div class="flex h-11 w-11 items-center justify-center rounded-lg bg-surface-gray-2 text-ink-gray-8 group-hover:bg-surface-gray-3">
          <LucideIcon :name="t.icon" class="h-5 w-5" />
        </div>
        <div class="text-[13px] font-semibold text-ink-gray-8">{{ t.label }}</div>
        <div class="text-[11px] leading-tight text-ink-gray-5">{{ HINTS[t.value] }}</div>
      </button>
    </div>

    <button
      class="mt-5 flex items-center gap-1.5 text-[13px] font-medium text-ink-gray-5 hover:text-ink-gray-8"
      @click="$emit('new-folder')"
    >
      <LucideIcon name="folder-plus" class="h-4 w-4" />
      or create a folder
    </button>
  </div>
</template>
