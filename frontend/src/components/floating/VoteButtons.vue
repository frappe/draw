<script setup>
// A chat-reaction-style up/down vote pair (T3), shared by every whiteboard object
// toolbar (sticky note + the object selection editor). Stateless: it takes the
// current tally and emits `vote(dir)` — the caller owns the store write. Buttons
// are auto-width so the count never clips.
import { Tooltip } from 'frappe-ui'

defineProps({
  votes: { type: Object, default: () => ({ up: 0, down: 0 }) },
})
defineEmits(['vote'])

const btn =
  'flex h-8 items-center justify-center rounded-md px-1.5 text-ink-gray-7 hover:bg-surface-gray-2'
</script>

<template>
  <Tooltip text="Upvote">
    <button :class="btn" @mousedown.prevent @pointerdown.stop @click="$emit('vote', 'up')">
      <span class="text-[13px]">👍</span>
      <span v-if="votes.up" class="ml-0.5 text-[11px] text-ink-gray-6">{{ votes.up }}</span>
    </button>
  </Tooltip>
  <Tooltip text="Downvote">
    <button :class="btn" @mousedown.prevent @pointerdown.stop @click="$emit('vote', 'down')">
      <span class="text-[13px]">👎</span>
      <span v-if="votes.down" class="ml-0.5 text-[11px] text-ink-gray-6">{{ votes.down }}</span>
    </button>
  </Tooltip>
</template>
