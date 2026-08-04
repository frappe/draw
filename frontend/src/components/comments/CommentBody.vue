<script setup>
// Renders a comment body: plain-text runs interpolated (never v-html, so a comment
// can't inject markup) with @mentions shown as chips. parseComment does the split.
import { computed } from 'vue'
import { parseComment } from './commentMarkup.js'

const props = defineProps({
  content: { type: String, default: '' },
})

const segments = computed(() => parseComment(props.content))
</script>

<template>
  <span class="whitespace-pre-wrap break-words text-p-sm text-ink-gray-8">
    <template v-for="(seg, i) in segments" :key="i">
      <span
        v-if="seg.type === 'mention'"
        class="rounded bg-surface-gray-2 px-1 font-medium text-ink-gray-9"
        >@{{ seg.label }}</span
      ><template v-else>{{ seg.value }}</template>
    </template>
  </span>
</template>
