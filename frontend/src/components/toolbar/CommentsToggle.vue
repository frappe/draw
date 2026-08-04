<script setup>
// Toolbar toggle for the comments side panel (#108). Shows the open-thread count as
// a small badge so unread discussion is visible without opening the panel.
import { computed } from 'vue'
import { Button, Tooltip } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useComments } from '@/composables/useComments.js'

const editorUi = useEditorUi()
const comments = useComments()

const openCount = computed(() => comments.openThreads.value.length)
const active = computed(() => editorUi.state.commentsPanelOpen)
</script>

<template>
  <Tooltip text="Comments">
    <Button
      variant="ghost"
      :class="active ? 'bg-surface-gray-3' : ''"
      aria-label="Comments"
      @click="editorUi.toggleCommentsPanel()"
    >
      <template #icon>
        <span class="relative flex items-center">
          <LucideIcon name="message-square" class="h-4 w-4" />
          <span
            v-if="openCount"
            class="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-surface-gray-7 px-1 text-[10px] font-semibold text-ink-white"
            >{{ openCount }}</span
          >
        </span>
      </template>
    </Button>
  </Tooltip>
</template>
