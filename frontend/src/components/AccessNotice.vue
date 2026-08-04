<script setup>
// Full-page "you can't open this" state, shared by the viewer (a private diagram)
// and the editor (a diagram that is not shared with you, #173). The default slot
// carries the way out — usually a link back to the library.
import LucideIcon from '@/icons/LucideIcon.vue'

defineProps({
  title: { type: String, required: true },
  message: { type: String, required: true },
})
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
    <div class="flex h-12 w-12 items-center justify-center rounded-full bg-surface-gray-2">
      <LucideIcon name="lock" class="h-5 w-5 text-ink-gray-5" />
    </div>
    <div>
      <h1 class="text-lg font-semibold text-ink-gray-9">{{ title }}</h1>
      <p class="mt-1 max-w-sm text-sm text-ink-gray-5">{{ message }}</p>
    </div>
    <slot />
  </div>
</template>
