<script setup>
// Comments side panel (#108) — the Docs/Writer-style list of every thread on the
// diagram, with an Open / Resolved filter and resolve/reply inline. Docked on the
// right of the editor; toggled from the toolbar. Clicking a thread focuses its pin.
import { ref, computed } from 'vue'
import { Button } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useComments } from '@/composables/useComments.js'
import CommentThread from './CommentThread.vue'

const editorUi = useEditorUi()
const comments = useComments()

const tab = ref('open')
const shown = computed(() => (tab.value === 'open' ? comments.openThreads.value : comments.resolvedThreads.value))

function armAdd() {
  editorUi.armComment()
}

function focusThread(thread) {
  comments.openThread(thread.root.name)
}
</script>

<template>
  <aside class="flex h-full w-80 shrink-0 flex-col border-l border-outline-gray-2 bg-surface-gray-1">
    <!-- header -->
    <div class="flex items-center justify-between px-3 py-2.5">
      <div class="flex items-center gap-2 text-p-base font-semibold text-ink-gray-9">
        <LucideIcon name="message-square" class="h-4 w-4" />
        Comments
      </div>
      <button
        class="rounded p-1 text-ink-gray-5 hover:bg-surface-gray-3"
        aria-label="Close comments"
        @click="editorUi.toggleCommentsPanel()"
      >
        <LucideIcon name="x" class="h-4 w-4" />
      </button>
    </div>

    <!-- add + arming hint -->
    <div class="px-3 pb-2">
      <Button v-if="comments.canComment.value" class="w-full" variant="subtle" @click="armAdd">
        <template #prefix><LucideIcon name="message-square" class="h-4 w-4" /></template>
        Add comment
      </Button>
      <p v-if="editorUi.state.pendingComment" class="mt-1.5 text-p-xs text-ink-gray-5">
        Click a shape or an empty spot on the canvas to place your comment.
      </p>
    </div>

    <!-- filter -->
    <div class="flex gap-1 px-3 pb-2 text-p-sm">
      <button
        v-for="option in ['open', 'resolved']"
        :key="option"
        class="rounded px-2 py-0.5 capitalize"
        :class="tab === option ? 'bg-surface-gray-3 font-medium text-ink-gray-9' : 'text-ink-gray-6 hover:bg-surface-gray-2'"
        @click="tab = option"
      >
        {{ option }}
        <span class="text-ink-gray-4">
          {{ option === 'open' ? comments.openThreads.value.length : comments.resolvedThreads.value.length }}
        </span>
      </button>
    </div>

    <!-- list -->
    <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
      <p v-if="comments.loading.value && !comments.comments.value.length" class="px-1 py-6 text-center text-p-sm text-ink-gray-4">
        Loading…
      </p>
      <p v-else-if="!shown.length" class="px-1 py-6 text-center text-p-sm text-ink-gray-4">
        {{ tab === 'open' ? 'No open comments yet.' : 'No resolved comments.' }}
      </p>
      <div v-else class="flex flex-col gap-2">
        <div
          v-for="thread in shown"
          :key="thread.root.name"
          class="cursor-pointer"
          :class="comments.activeThread.value === thread.root.name ? 'rounded-lg ring-2 ring-outline-gray-3' : ''"
          @click="focusThread(thread)"
        >
          <CommentThread :thread="thread" variant="panel" />
        </div>
      </div>
    </div>
  </aside>
</template>
