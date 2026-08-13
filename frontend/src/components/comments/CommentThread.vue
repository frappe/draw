<script setup>
// One comment thread in the side panel: the root comment, its replies, and the
// actions on them (#108, reworked for #424). The panel is the only place a comment
// is managed — the canvas carries pins, not cards — so this renders in one place and
// there is no second copy to fall out of step with.
//
// All actions go through the injected comments store, which changes the list first
// and reconciles with the server after. Permission is enforced on the server; the
// affordances here just avoid offering what will be refused.
import { ref, computed, nextTick } from 'vue'
import { Avatar, Button, Tooltip, toast } from 'frappe-ui'
import { confirm } from '@/composables/useConfirm.js'
import { useComments } from '@/composables/useComments.js'
import CommentBody from './CommentBody.vue'
import CommentComposer from './CommentComposer.vue'

const props = defineProps({
  thread: { type: Object, required: true }, // { root, replies }
  active: { type: Boolean, default: false },
})

const comments = useComments()
const replying = ref(false)
const editingName = ref(null)
const composer = ref(null)

const root = computed(() => props.thread.root)
const replies = computed(() => props.thread.replies || [])
const resolved = computed(() => !!root.value.resolved)
const rows = computed(() => [root.value, ...replies.value])

function canEdit(comment) {
  return comment.owner === comments.me.id && !comment.pending
}
function canDelete(comment) {
  return (comment.owner === comments.me.id || comments.canModerate.value) && !comment.pending
}

// Reply opens the composer immediately and focuses it; the posting happens behind
// it. Waiting for the server before showing a box to type in is what made replying
// feel slow (#424 item 4).
async function startReply() {
  replying.value = true
  await nextTick()
  composer.value?.focus?.()
}

async function submitReply(content) {
  replying.value = false
  await comments.reply(root.value.name, content)
}

async function saveEdit(comment, content) {
  editingName.value = null
  await comments.edit(comment.name, content)
}

function toggleResolve() {
  comments.resolve(root.value.name, !resolved.value)
}

// Deleting is irreversible and the trigger is a one-click icon, so it asks first
// (#293). `remove` throws when the server refuses: the dialog then holds itself
// open and shows why, and the success toast below is never reached — the two
// contradicting each other is the fault in #424.
function remove(comment) {
  confirm({
    title: 'Delete comment?',
    message: comment.parent_comment
      ? 'This reply will be removed for everyone.'
      : 'This comment and its replies will be removed for everyone.',
    theme: 'red',
    confirmLabel: 'Delete',
    onConfirm: async () => {
      await comments.remove(comment.name)
      toast.success('Comment deleted')
    },
  })
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
  <!-- A surface, not a box: the list reads as a column of comments rather than a
       stack of framed cards. The active thread is the one the canvas pin points at,
       and says so with a ring. -->
  <div
    class="rounded-lg p-3 transition"
    :class="[
      active ? 'bg-surface-gray-1 ring-1 ring-outline-gray-2' : 'hover:bg-surface-gray-1',
      resolved && !active ? 'opacity-70' : '',
    ]"
  >
    <div v-for="(comment, index) in rows" :key="comment.name" :class="index > 0 ? 'mt-3 pl-6' : ''">
      <div class="group/comment flex gap-2">
        <Avatar size="sm" :image="comment.author_image" :label="comment.author || comment.owner" />
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline gap-2">
            <span class="truncate text-p-sm font-medium text-ink-gray-8">{{ comment.author || comment.owner }}</span>
            <span class="shrink-0 text-p-xs text-ink-gray-5">
              {{ comment.pending ? 'Sending…' : timeAgo(comment.creation) }}
            </span>
            <!-- Fixed trailing slot so the names above stay on one lane whether or
                 not a row has actions. Revealed on hover, always reachable by tab. -->
            <div
              class="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 focus-within:opacity-100 group-hover/comment:opacity-100"
            >
              <Button
                v-if="canEdit(comment)"
                variant="ghost"
                theme="gray"
                size="sm"
                icon="lucide-pencil"
                tooltip="Edit"
                label="Edit comment"
                @click="editingName = comment.name"
              />
              <Button
                v-if="canDelete(comment)"
                variant="ghost"
                theme="gray"
                size="sm"
                icon="lucide-trash-2"
                tooltip="Delete"
                label="Delete comment"
                @click="remove(comment)"
              />
            </div>
          </div>

          <CommentComposer
            v-if="editingName === comment.name"
            class="mt-1.5"
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

    <!-- Thread actions. Resolve and Reopen live here, in the panel, so a thread's
         state is changed in one place (#424 item 3). -->
    <div v-if="comments.canComment.value" class="mt-2.5 flex items-center gap-1 pl-8">
      <Button v-if="!replying && !resolved" variant="ghost" size="sm" label="Reply" @click="startReply">
        <template #prefix><span class="lucide-reply h-3.5 w-3.5" aria-hidden="true" /></template>
        Reply
      </Button>
      <Tooltip :text="resolved ? 'Reopen this thread' : 'Mark this thread resolved'">
        <Button variant="ghost" size="sm" :label="resolved ? 'Reopen thread' : 'Resolve thread'" @click="toggleResolve">
          <template #prefix>
            <span
              :class="resolved ? 'lucide-rotate-ccw' : 'lucide-circle-check'"
              class="h-3.5 w-3.5"
              aria-hidden="true"
            />
          </template>
          {{ resolved ? 'Reopen' : 'Resolve' }}
        </Button>
      </Tooltip>
      <span v-if="resolved && root.resolved_by" class="ml-auto truncate text-p-xs text-ink-gray-5">
        Resolved by {{ root.resolved_by }}
      </span>
    </div>

    <CommentComposer
      v-if="comments.canComment.value && replying"
      ref="composer"
      class="mt-2 pl-8"
      placeholder="Reply…"
      submit-label="Reply"
      autofocus
      @submit="submitReply"
      @cancel="replying = false"
    />
  </div>
</template>
