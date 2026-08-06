<script setup>
// One comment thread: the root comment, its replies, and the actions on them.
// Reused by the canvas pin popover and the side panel. All actions go through the
// injected comments store; permission is enforced on the server — the affordances
// here just avoid offering what will be refused.
import { ref, computed } from 'vue'
import { Avatar, Button, Tooltip } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import { useComments } from '@/composables/useComments.js'
import CommentBody from './CommentBody.vue'
import CommentComposer from './CommentComposer.vue'

const props = defineProps({
  thread: { type: Object, required: true }, // { root, replies }
  // 'panel' shows the whole thread; 'popover' is the same, sized for the canvas card.
  variant: { type: String, default: 'panel' },
})

const comments = useComments()
const replying = ref(false)
const editingName = ref(null)

const root = computed(() => props.thread.root)
const replies = computed(() => props.thread.replies || [])
const resolved = computed(() => !!root.value.resolved)

function canEdit(comment) {
  return comment.owner === comments.me.id
}
function canDelete(comment) {
  return comment.owner === comments.me.id || comments.canModerate.value
}

async function submitReply(content) {
  await comments.reply(root.value.name, content)
  replying.value = false
}

async function saveEdit(comment, content) {
  await comments.edit(comment.name, content)
  editingName.value = null
}

function toggleResolve() {
  comments.resolve(root.value.name, !resolved.value)
}

async function remove(comment) {
  await comments.remove(comment.name)
}

// A short, dependency-free relative time ("2h", "3d", "just now").
function timeAgo(iso) {
  if (!iso) return ''
  const then = new Date(iso.replace(' ', 'T')).getTime()
  if (Number.isNaN(then)) return ''
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (secs < 45) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days}d`
  return new Date(then).toLocaleDateString()
}
</script>

<template>
  <div
    class="rounded-lg border bg-surface-elevation-1"
    :class="[
      resolved ? 'border-outline-gray-1 opacity-70' : 'border-outline-gray-2',
      variant === 'popover' ? 'w-80 shadow-2xl' : '',
    ]"
  >
    <!-- resolved banner -->
    <div
      v-if="resolved"
      class="flex items-center gap-1.5 rounded-t-lg bg-surface-gray-1 px-3 py-1 text-p-xs text-ink-gray-6"
    >
      <LucideIcon name="circle-check" class="h-3.5 w-3.5 text-ink-green-3" />
      Resolved<span v-if="root.resolved_by"> by {{ root.resolved_by }}</span>
    </div>

    <div class="p-3">
      <!-- root + each reply, one comment row template -->
      <div
        v-for="(comment, i) in [root, ...replies]"
        :key="comment.name"
        :class="i > 0 ? 'mt-3 border-t border-outline-gray-1 pt-3' : ''"
      >
        <div class="group flex gap-2">
          <Avatar size="sm" :image="comment.author_image" :label="comment.author || comment.owner" />
          <div class="min-w-0 flex-1">
            <div class="flex items-baseline gap-2">
              <span class="truncate text-p-sm font-medium text-ink-gray-9">{{ comment.author || comment.owner }}</span>
              <span class="shrink-0 text-p-xs text-ink-gray-4">{{ timeAgo(comment.creation) }}</span>
              <!-- per-comment actions, on hover -->
              <div class="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
                <Tooltip v-if="canEdit(comment)" text="Edit">
                  <button class="rounded p-1 text-ink-gray-5 hover:bg-surface-gray-2" @click="editingName = comment.name">
                    <LucideIcon name="pencil" class="h-3.5 w-3.5" />
                  </button>
                </Tooltip>
                <Tooltip v-if="canDelete(comment)" text="Delete">
                  <button class="rounded p-1 text-ink-gray-5 hover:bg-surface-gray-2" @click="remove(comment)">
                    <LucideIcon name="trash-2" class="h-3.5 w-3.5" />
                  </button>
                </Tooltip>
              </div>
            </div>

            <CommentComposer
              v-if="editingName === comment.name"
              class="mt-1"
              :initial="comment.content"
              submit-label="Save"
              autofocus
              @submit="(content) => saveEdit(comment, content)"
              @cancel="editingName = null"
            />
            <CommentBody v-else class="mt-0.5 block" :content="comment.content" />
          </div>
        </div>
      </div>

      <!-- thread-level actions -->
      <div class="mt-3 flex items-center gap-2">
        <Button v-if="comments.canComment.value" variant="subtle" size="sm" @click="toggleResolve">
          <template #prefix><LucideIcon name="check" class="h-3.5 w-3.5" /></template>
          {{ resolved ? 'Reopen' : 'Resolve' }}
        </Button>
        <Button v-if="comments.canComment.value && !replying && !resolved" variant="ghost" size="sm" label="Reply" @click="replying = true" />
      </div>

      <CommentComposer
        v-if="comments.canComment.value && replying"
        class="mt-2"
        placeholder="Reply…"
        submit-label="Reply"
        autofocus
        @submit="submitReply"
        @cancel="replying = false"
      />
    </div>
  </div>
</template>
