<script setup>
// Top bar (48px). Drive/Writer style: NO back button — a breadcrumb instead.
// Left: the violet logomark + "Frappe Draw" (→ Home) / optional folder / the
// editable diagram title as the last crumb + save indicator. Right: Export,
// Share, presence. Chrome only — frappe-ui + its tokens; the breadcrumb
// styling mirrors frappe-ui's Breadcrumbs (text-lg, ink-gray ladder).
import { useRouter } from 'vue-router'
import Logomark from '@/components/Logomark.vue'
import TitleEditor from './TitleEditor.vue'
import SaveIndicator from './SaveIndicator.vue'
import ExportMenu from './ExportMenu.vue'
import ShareMenu from './ShareMenu.vue'
import DriveMenu from './DriveMenu.vue'
import PresenceAvatars from './PresenceAvatars.vue'

defineProps({
  title: { type: String, default: 'Untitled diagram' },
  saveStatus: { type: String, default: 'saved' },
})
const emit = defineEmits(['update:title'])

const router = useRouter()

function goHome() {
  router.push({ name: 'Home' })
}
</script>

<template>
  <header
    class="flex h-12 flex-none items-center gap-1 border-b border-outline-gray-1 bg-surface-base px-3"
  >
    <!-- Breadcrumb: logo + Frappe Draw (→ Home). -->
    <button
      class="flex items-center gap-2 rounded px-1 py-1 hover:bg-surface-gray-2"
      title="All diagrams"
      @click="goHome"
    >
      <Logomark :size="22" />
      <span class="text-lg font-medium text-ink-gray-5 hover:text-ink-gray-7">Frappe Draw</span>
    </button>

    <span class="mx-0.5 text-base text-ink-gray-4" aria-hidden="true">/</span>

    <!-- Current diagram — the editable last crumb. -->
    <TitleEditor :title="title" @update:title="emit('update:title', $event)" />

    <SaveIndicator :status="saveStatus" />

    <div class="ml-auto flex items-center gap-2">
      <ExportMenu />
      <DriveMenu />
      <ShareMenu />

      <div class="h-5 w-px bg-surface-gray-3" />

      <PresenceAvatars />
    </div>
  </header>
</template>
