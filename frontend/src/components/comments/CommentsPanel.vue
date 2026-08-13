<script setup>
// Comments side panel (#108, reworked for #424) — the Docs/Writer-style list of
// every thread on the diagram, with an Open / Resolved filter. Docked on the right
// of the editor and toggled from the toolbar.
//
// This is the source of truth for comment management: replying, editing, resolving
// and deleting all happen here, and the canvas carries pins that navigate to a
// thread rather than a second copy of it.
import { ref, computed, watch, nextTick } from 'vue'
import { Button, TabButtons } from 'frappe-ui'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useComments } from '@/composables/useComments.js'
import CommentThread from './CommentThread.vue'

const editorUi = useEditorUi()
const comments = useComments()

const tab = ref('open')
const list = ref(null)

const openCount = computed(() => comments.openThreads.value.length)
const resolvedCount = computed(() => comments.resolvedThreads.value.length)
// Counts ride the same computed the lists do, so resolving a thread moves it and
// re-counts both tabs in the same tick (#424 item 14).
const filterTabs = computed(() => [
  { value: 'open', label: `Open ${openCount.value}` },
  { value: 'resolved', label: `Resolved ${resolvedCount.value}` },
])
const shown = computed(() =>
  tab.value === 'open' ? comments.openThreads.value : comments.resolvedThreads.value,
)

// Following a pin has to land on the thread even when it is filed under the other
// tab or scrolled out of sight, or "go to this comment" quietly does nothing.
watch(
  () => comments.activeThread.value,
  async (name) => {
    if (!name) return
    const thread = comments.threads.value.find((t) => t.root.name === name)
    if (!thread) return
    tab.value = thread.root.resolved ? 'resolved' : 'open'
    await nextTick()
    list.value?.querySelector(`[data-thread="${name}"]`)?.scrollIntoView({ block: 'nearest' })
  },
)

// Closing takes the whole experience with it: no armed placement left behind, no
// half-written draft, no thread still marked active for the next open (#424 item 7).
function close() {
  comments.cancelDraft()
  comments.closeThread()
  editorUi.toggleCommentsPanel()
}
</script>

<template>
  <aside class="flex h-full w-80 shrink-0 flex-col border-l border-outline-gray-2 bg-surface-base">
    <div class="flex items-center justify-between px-3 py-2.5">
      <span class="text-p-base font-semibold text-ink-gray-9">Comments</span>
      <Button variant="ghost" theme="gray" size="sm" icon="lucide-x" tooltip="Close comments" label="Close comments" @click="close" />
    </div>

    <div class="flex flex-col gap-2 px-3 pb-2">
      <Button v-if="comments.canComment.value" class="w-full" variant="subtle" @click="editorUi.armComment()">
        <template #prefix><span class="lucide-message-square-plus h-4 w-4" aria-hidden="true" /></template>
        Add comment
      </Button>
      <p v-if="editorUi.state.pendingComment" class="text-p-xs text-ink-gray-5">
        Click a shape or an empty spot on the canvas to place your comment.
      </p>
      <TabButtons v-model="tab" size="sm" :options="filterTabs" />
    </div>

    <div ref="list" class="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
      <p v-if="comments.loading.value && !comments.comments.value.length" class="px-1 py-6 text-center text-p-sm text-ink-gray-5">
        Loading…
      </p>
      <p v-else-if="!shown.length" class="px-1 py-6 text-center text-p-sm text-ink-gray-5">
        {{ tab === 'open' ? 'No open comments yet.' : 'No resolved comments.' }}
      </p>
      <div v-else class="flex flex-col gap-1">
        <div
          v-for="thread in shown"
          :key="thread.root.name"
          :data-thread="thread.root.name"
          class="cursor-pointer"
          @click="comments.openThread(thread.root.name)"
        >
          <CommentThread :thread="thread" :active="comments.activeThread.value === thread.root.name" />
        </div>
      </div>
    </div>
  </aside>
</template>
