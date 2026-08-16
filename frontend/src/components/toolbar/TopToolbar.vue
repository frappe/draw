<script setup>
// Canvas top bar (48px), three columns like the Frappe Slides navbar (#306):
// LEFT is the app icon and nothing else — it goes Home. CENTER is the diagram
// title, editable in place. RIGHT is the actions cluster: export, Drive, comments,
// share, the "…" overflow (#111), save problems and presence.
//
// The Drive-path breadcrumb that used to sit on the left is gone; Drive is still
// reachable from DriveMenu. Chrome only — frappe-ui and its tokens.
import { useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import Logomark from '@/components/Logomark.vue'
import TitleEditor from './TitleEditor.vue'
import SaveIndicator from './SaveIndicator.vue'
import ExportDialog from './ExportDialog.vue'
import ShareMenu from './ShareMenu.vue'
import CommentsToggle from './CommentsToggle.vue'
import DriveMenu from './DriveMenu.vue'
import OverflowMenu from './OverflowMenu.vue'
import PresenceAvatars from './PresenceAvatars.vue'

defineProps({
  title: { type: String, default: 'Untitled diagram' },
  saveStatus: { type: String, default: 'saved' },
  // Autosave's freeze reason, when it is frozen — shown in place of the status.
  saveMessage: { type: String, default: '' },
  // Whether reloading can recover a frozen session (#504).
  saveRecoverable: { type: Boolean, default: true },
  // Connectivity is announced as a toast instead, so the indicator stays quiet.
  offline: { type: Boolean, default: false },
})
const emit = defineEmits(['update:title', 'download'])

const router = useRouter()

function goHome() {
  router.push({ name: 'Home' })
}
</script>

<template>
  <header
    class="grid h-12 flex-none grid-cols-3 items-center border-b border-outline-gray-1 bg-surface-base px-3"
  >
    <!-- LEFT: the app icon only. It is the Home affordance. -->
    <div class="flex items-center justify-start">
      <Button variant="ghost" theme="gray" size="md" label="Draw Home" @click="goHome">
        <template #icon><Logomark :size="22" /></template>
      </Button>
    </div>

    <!-- CENTER: the diagram title, click to rename in place. -->
    <div class="flex min-w-0 items-center justify-center">
      <TitleEditor :title="title" @update:title="emit('update:title', $event)" />
    </div>

    <!-- RIGHT: actions. -->
    <div class="flex items-center justify-end gap-2">
      <SaveIndicator
        :status="saveStatus"
        :message="saveMessage"
        :recoverable="saveRecoverable"
        :offline="offline"
        @download="emit('download')"
      />
      <ExportDialog />
      <DriveMenu />
      <CommentsToggle />
      <ShareMenu />
      <!-- "…" overflow: Show info / Pin / Delete (#111). Rename is the title itself. -->
      <OverflowMenu />
      <PresenceAvatars />
    </div>
  </header>
</template>
