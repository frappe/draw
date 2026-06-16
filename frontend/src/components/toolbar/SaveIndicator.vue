<script setup>
// Saved / Saving… trust indicator (spec §4.4, §8). Binds to the autosave status.
import { computed } from 'vue'
import { FeatherIcon } from 'frappe-ui'

const props = defineProps({
  status: { type: String, default: 'saved' },
})

const label = computed(() => (props.status === 'saving' ? 'Saving…' : 'Saved'))
</script>

<template>
  <div class="flex items-center gap-1 text-xs text-ink-gray-5">
    <FeatherIcon
      v-if="status === 'saved'"
      name="check"
      class="h-3.5 w-3.5 text-green-600"
    />
    <span>{{ label }}</span>
  </div>
</template>
