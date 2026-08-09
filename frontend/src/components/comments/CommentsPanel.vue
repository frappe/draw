<script setup>
// Comments side panel (#108) — the Docs/Writer-style list of every thread on the
// diagram, with an Open / Resolved filter and resolve/reply inline. Docked on the
// right of the editor; toggled from the toolbar. Clicking a thread focuses its pin.
import { ref, computed } from 'vue'
import { Button, TabButtons } from 'frappe-ui'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useComments } from '@/composables/useComments.js'
import CommentThread from './CommentThread.vue'

const editorUi = useEditorUi()
const comments = useComments()

const tab = ref('open')
const filterTabs = computed(() => [
  { value: 'open', label: `Open ${comments.openThreads.value.length}` },
  { value: 'resolved', label: `Resolved ${comments.resolvedThreads.value.length}` },
])
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
        <span class="lucide-message-square h-4 w-4" aria-hidden="true" />
        Comments
      </div>
      <Button
        variant="ghost"
        theme="gray"
        size="sm"
        icon="lucide-x"
        tooltip="Close comments"
        label="Close comments"
        @click="editorUi.toggleCommentsPanel()"
      />
    </div>

    <!-- add + arming hint -->
    <div class="px-3 pb-2">
      <Button v-if="comments.canComment.value" class="w-full" variant="subtle" @click="armAdd">
        <template #prefix><span class="lucide-message-square h-4 w-4" aria-hidden="true" /></template>
        Add comment
      </Button>
      <p v-if="editorUi.state.pendingComment" class="mt-1.5 text-p-xs text-ink-gray-5">
        Click a shape or an empty spot on the canvas to place your comment.
      </p>
    </div>

    <!-- filter -->
    <div class="px-3 pb-2">
      <TabButtons v-model="tab" size="sm" :options="filterTabs" />
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
