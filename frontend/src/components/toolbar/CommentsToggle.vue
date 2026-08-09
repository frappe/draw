<script setup>
// Toolbar toggle for the comments side panel (#108). Shows the open-thread count as
// a small badge so unread discussion is visible without opening the panel.
import { computed } from 'vue'
import { Button } from 'frappe-ui'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useComments } from '@/composables/useComments.js'

const editorUi = useEditorUi()
const comments = useComments()

const openCount = computed(() => comments.openThreads.value.length)
const active = computed(() => editorUi.state.commentsPanelOpen)
</script>

<template>
  <!-- Declared like its neighbours in the actions cluster (#229): ghost, icon only,
       `label` for the accessible name. The badge needs the #icon slot, so the icon
       cannot come from the `icon` prop here. -->
  <Button
    variant="ghost"
    :class="active ? 'bg-surface-gray-3' : ''"
    label="Comments"
    tooltip="Comments"
    @click="editorUi.toggleCommentsPanel()"
  >
    <template #icon>
      <span class="relative flex items-center">
        <span class="lucide-message-square h-4 w-4" aria-hidden="true" />
        <span
          v-if="openCount"
          class="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-surface-gray-7 px-1 text-2xs font-semibold text-white"
          >{{ openCount }}</span
        >
      </span>
    </template>
  </Button>
</template>
