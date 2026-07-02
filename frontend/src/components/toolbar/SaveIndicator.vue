<script setup>
// Saved / Saving… trust indicator (spec §4.4, §8, README §4a). Binds to the
// autosave status: green check "Saved" at rest, a spinning loader "Saving…"
// during the ~1.5s debounce, and a red warning if a save fails. Green check is
// the only functional color here; everything else is neutral chrome.
import { computed } from 'vue'
import LucideIcon from '@/icons/LucideIcon.vue'

const props = defineProps({
  status: { type: String, default: 'saved' },
})

const meta = computed(() => {
  if (props.status === 'saving') {
    return { label: 'Saving…', icon: 'loader', tone: 'text-ink-gray-5', spin: true }
  }
  if (props.status === 'error') {
    return { label: 'Save failed', icon: 'alert-circle', tone: 'text-red-600', spin: false }
  }
  return { label: 'Saved', icon: 'check', tone: 'text-green-600', spin: false }
})
</script>

<template>
  <div class="flex flex-none items-center gap-1 text-xs text-ink-gray-5">
    <LucideIcon
      :name="meta.icon"
      class="h-3.5 w-3.5"
      :class="[meta.tone, { 'animate-spin': meta.spin }]"
    />
    <span>{{ meta.label }}</span>
  </div>
</template>
