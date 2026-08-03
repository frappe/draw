<script setup>
// Top bar (48px). Drive/Writer style: NO back button — a breadcrumb instead.
// Left: the violet logomark (→ Home) + the diagram's Drive-path breadcrumb
// (Home / Folder / …, #112) + the editable diagram title as the last crumb +
// save indicator. When Drive is absent/unregistered it degrades to the static
// "Frappe Draw" crumb. Right: Export, Share, a "…" overflow menu (#111),
// presence. Chrome only — frappe-ui + its tokens; the breadcrumb styling mirrors
// frappe-ui's Breadcrumbs (text-lg ladder).
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Logomark from '@/components/Logomark.vue'
import TitleEditor from './TitleEditor.vue'
import SaveIndicator from './SaveIndicator.vue'
import ExportMenu from './ExportMenu.vue'
import ShareMenu from './ShareMenu.vue'
import DriveMenu from './DriveMenu.vue'
import OverflowMenu from './OverflowMenu.vue'
import PresenceAvatars from './PresenceAvatars.vue'
import { getDiagramDrivePath } from '@/data/drive.js'
import { driveBreadcrumbCrumbs } from './driveBreadcrumb.js'

defineProps({
  title: { type: String, default: 'Untitled diagram' },
  saveStatus: { type: String, default: 'saved' },
  // Autosave's freeze reason, when it is frozen — shown in place of the status.
  saveMessage: { type: String, default: '' },
})
const emit = defineEmits(['update:title'])

const route = useRoute()
const router = useRouter()

// The overflow menu's "Rename" re-enters the inline title editor (same path as
// clicking the breadcrumb title), so hold a ref to trigger it.
const titleEditor = ref(null)

// Drive-path breadcrumb (#112): fetch this diagram's folder ancestry once. Empty
// (Drive absent / errored / unregistered) → render the static "Frappe Draw" crumb.
const driveCrumbs = ref([])
const showDriveBreadcrumb = computed(() => driveCrumbs.value.length > 0)

onMounted(async () => {
  const name = route.params.name
  if (!name) return
  // getDiagramDrivePath is null-safe (returns null on any error), so a failed or
  // absent Drive call can never break the toolbar — it just stays on the fallback.
  driveCrumbs.value = driveBreadcrumbCrumbs(await getDiagramDrivePath(name))
})

function goHome() {
  router.push({ name: 'Home' })
}

// Open a Drive folder crumb in Frappe Drive (new tab), mirroring DriveMenu's
// window.open hand-off. `/drive/d/<name>` is Drive's canonical folder route.
function openInDrive(name) {
  window.open('/drive/d/' + name, '_blank')
}
</script>

<template>
  <header
    class="flex h-12 flex-none items-center gap-1 border-b border-outline-gray-1 bg-surface-base px-3"
  >
    <!-- Breadcrumb root: the logomark is always the Home affordance (→ Draw Home).
         In the static fallback it carries the "Frappe Draw" label; in Drive mode the
         Drive folder crumbs take its place. -->
    <button
      class="flex items-center gap-2 rounded px-1 py-1 hover:bg-surface-gray-2"
      title="Home"
      @click="goHome"
    >
      <Logomark :size="22" />
      <span
        v-if="!showDriveBreadcrumb"
        class="text-lg font-medium text-ink-gray-5 hover:text-ink-gray-7"
        >Frappe Draw</span
      >
    </button>

    <!-- Drive-path crumbs (#112): Home / Folder / … — each opens that folder in Drive. -->
    <template v-if="showDriveBreadcrumb">
      <template v-for="crumb in driveCrumbs" :key="crumb.name">
        <span class="mx-0.5 text-base text-ink-gray-4" aria-hidden="true">/</span>
        <button
          class="max-w-[12rem] truncate rounded px-1 py-1 text-lg font-medium text-ink-gray-5 hover:bg-surface-gray-2 hover:text-ink-gray-7"
          :title="`Open ${crumb.title} in Frappe Drive`"
          @click="openInDrive(crumb.name)"
        >
          {{ crumb.title }}
        </button>
      </template>
    </template>

    <span class="mx-0.5 text-base text-ink-gray-4" aria-hidden="true">/</span>

    <!-- Current diagram — the editable last crumb. -->
    <TitleEditor ref="titleEditor" :title="title" @update:title="emit('update:title', $event)" />

    <SaveIndicator :status="saveStatus" :message="saveMessage" />

    <div class="ml-auto flex items-center gap-2">
      <ExportMenu />
      <DriveMenu />
      <ShareMenu />
      <!-- "…" overflow: Rename / Show info / Favourite / Delete (#111). -->
      <OverflowMenu @rename="titleEditor?.startEditing()" />

      <div class="h-5 w-px bg-surface-gray-3" />

      <PresenceAvatars />
    </div>
  </header>
</template>
