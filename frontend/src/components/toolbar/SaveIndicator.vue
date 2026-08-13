<script setup>
// Save PROBLEM indicator (spec §4.4, §8, README §4a). The healthy path is silent:
// a diagram that is saving normally, or is saved, shows nothing at all — steady
// state needs no chrome, and advertising "Saved" trains people to ignore the one
// place a real problem would appear (#307).
//
// `message` is autosave's freeze reason ("changed elsewhere — reload"). It wins
// over the status label: a frozen editor still accepts every edit, so "Save failed"
// alone left the user with no idea their work had stopped being kept, or what to do
// about it (GitHub #171).
//
// Losing the network is NOT reported here (#417). It is announced once as a toast,
// and saying "Save failed" underneath it would give one problem two voices — the
// louder of which is wrong, since the edits are safe locally and go up on reconnect.
import { computed } from 'vue'

const props = defineProps({
  status: { type: String, default: 'saved' },
  message: { type: String, default: '' },
  offline: { type: Boolean, default: false },
})

// Only a freeze reason or an outright save failure surfaces.
const problem = computed(() => {
  if (props.message) return props.message
  if (props.offline) return ''
  if (props.status === 'error') return 'Save failed'
  return ''
})
</script>

<template>
  <div
    v-if="problem"
    class="flex flex-none items-center gap-1 text-sm text-ink-red-6"
    role="status"
  >
    <span class="lucide-circle-alert size-4 shrink-0" aria-hidden="true" />
    <span class="max-w-64 truncate" :title="problem">{{ problem }}</span>
  </div>
</template>
