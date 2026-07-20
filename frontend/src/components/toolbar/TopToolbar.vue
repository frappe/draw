<script setup>
// Top bar (48px). Drive/Writer style: NO back button — a breadcrumb instead.
// Left: the violet logomark + "Frappe Draw" (→ Home) / optional folder / the
// editable diagram title as the last crumb + save indicator. Right: Export,
// Share, Print, dark-mode, presence. Chrome only — frappe-ui + its tokens; the
// breadcrumb styling mirrors frappe-ui's Breadcrumbs (text-lg, ink-gray ladder).
import { useRouter } from 'vue-router'
import { Button, Tooltip } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import Logomark from '@/components/Logomark.vue'
import TitleEditor from './TitleEditor.vue'
import SaveIndicator from './SaveIndicator.vue'
import ExportMenu from './ExportMenu.vue'
import ShareMenu from './ShareMenu.vue'
import DriveMenu from './DriveMenu.vue'
import PresenceAvatars from './PresenceAvatars.vue'

const props = defineProps({
  title: { type: String, default: 'Untitled diagram' },
  saveStatus: { type: String, default: 'saved' },
  dark: { type: Boolean, default: false },
  folder: { type: String, default: '' },
  folderId: { type: String, default: '' },
})
const emit = defineEmits(['update:title', 'toggle-dark'])

const router = useRouter()

function goHome() {
  router.push({ name: 'Home' })
}

// Clicking the folder crumb returns Home with that folder open (K2/K3), so the
// user lands back where the diagram lives rather than at the root.
function goFolder() {
  if (props.folderId) router.push({ name: 'Home', query: { folder: props.folderId } })
  else goHome()
}

function print() {
  window.print()
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

    <!-- Folder crumb — click to jump back into the folder the diagram lives in. -->
    <template v-if="folder">
      <button
        class="max-w-[160px] truncate rounded px-1 py-1 text-lg font-medium text-ink-gray-5 hover:bg-surface-gray-2 hover:text-ink-gray-7"
        :title="`Open ${folder}`"
        @click="goFolder"
      >
        {{ folder }}
      </button>
      <span class="mx-0.5 text-base text-ink-gray-4" aria-hidden="true">/</span>
    </template>

    <!-- Current diagram — the editable last crumb. -->
    <TitleEditor :title="title" @update:title="emit('update:title', $event)" />

    <SaveIndicator :status="saveStatus" />

    <div class="ml-auto flex items-center gap-2">
      <ExportMenu />
      <DriveMenu />
      <ShareMenu />

      <Tooltip text="Print">
        <Button variant="outline" aria-label="Print" @click="print">
          <LucideIcon name="printer" class="h-4 w-4" />
        </Button>
      </Tooltip>

      <div class="h-5 w-px bg-surface-gray-3" />

      <Tooltip :text="dark ? 'Light mode' : 'Dark mode'">
        <Button variant="outline" :aria-label="dark ? 'Switch to light mode' : 'Switch to dark mode'" @click="emit('toggle-dark')">
          <LucideIcon :name="dark ? 'sun' : 'moon'" class="h-4 w-4" />
        </Button>
      </Tooltip>

      <PresenceAvatars />
    </div>
  </header>
</template>
