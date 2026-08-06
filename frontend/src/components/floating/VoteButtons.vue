<script setup>
// A chat-reaction-style up/down vote pair (T3), shared by every whiteboard object
// toolbar (sticky note + the object selection editor). Stateless: it takes the
// current tally and emits `vote(dir)` — the caller owns the store write. Buttons
// are auto-width so the count never clips.
import { Button } from 'frappe-ui'

defineProps({
  votes: { type: Object, default: () => ({ up: 0, down: 0 }) },
})
defineEmits(['vote'])
</script>

<template>
  <Button variant="ghost" theme="gray" size="md" tooltip="Upvote" label="Upvote" @mousedown.prevent @pointerdown.stop @click="$emit('vote', 'up')">
    <span class="text-sm">👍</span>
    <span v-if="votes.up" class="ml-0.5 text-sm text-ink-gray-6">{{ votes.up }}</span>
  </Button>
  <Button variant="ghost" theme="gray" size="md" tooltip="Downvote" label="Downvote" @mousedown.prevent @pointerdown.stop @click="$emit('vote', 'down')">
    <span class="text-sm">👎</span>
    <span v-if="votes.down" class="ml-0.5 text-sm text-ink-gray-6">{{ votes.down }}</span>
  </Button>
</template>
