<script setup>
// Home page — composes the sidebar + tile grid (+ empty state) + trash view, and
// routes to the editor on create/open (spec §2). "Create" makes a unified canvas
// and lands straight on the editor — no type picker (canvas unification). No
// folders (#115): diagrams are one flat, pinnable list.
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Dropdown, TabButtons, toast } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import { errorMessage } from '@/utils/errorText.js'
import Logomark from '@/components/Logomark.vue'
import SettingsDialog from '@/components/home/SettingsDialog.vue'
import TileGrid from '@/components/home/TileGrid.vue'
import EmptyState from '@/components/home/EmptyState.vue'
import TrashView from '@/components/home/TrashView.vue'
import { SIDEBAR_NAV, VIEW_TITLES } from '@/components/home/homeViews.js'
import { diagrams, createDiagram } from '@/data/diagrams.js'
import { logout } from '@/data/session.js'
import { getDriveAvailability, shouldShowInstallDriveBanner } from '@/data/drive.js'

const router = useRouter()
const view = ref('home')

// Nudge users without Frappe Drive to install it (so their diagrams are tracked
// as files). Hidden until we've confirmed Drive is absent, and after a dismiss.
const driveStatus = ref(null)
const bannerDismissed = ref(false)
const showInstallDriveBanner = computed(
  () => !bannerDismissed.value && shouldShowInstallDriveBanner(driveStatus.value),
)

onMounted(async () => {
  diagrams.fetch()
  driveStatus.value = await getDriveAvailability()
})

const list = computed(() => diagrams.data || [])
const isEmpty = computed(() => list.value.length === 0)

const title = computed(() => VIEW_TITLES[view.value] || 'Home')

// The view switcher replaces the old sidebar nav (#308). Same model, so the
// view set stays defined once in homeViews.js, which already stores each icon's
// complete lucide class.
const viewTabs = computed(() =>
  SIDEBAR_NAV.map((item) => ({ value: item.key, label: item.label, iconLeft: item.icon })),
)

// Real logged-in user, injected into the page boot by www/draw.py.
const fullName = computed(() => window.full_name || 'You')
const showSettings = ref(false)

// Log out, keeping the user here with an error if the session survives — a
// silent no-op would look like the old "403 Not Permitted" logout.
async function signOut() {
  try {
    await logout()
  } catch (error) {
    toast.error('Could not log out', { text: error?.message || '' })
  }
}

// App menu, mirroring the Frappe Slides navbar dropdown.
const appMenu = computed(() => [
  { label: 'Apps', icon: 'lucide-layout-grid', onClick: () => (window.location.href = '/apps') },
  { label: 'Settings', icon: 'lucide-settings', onClick: () => (showSettings.value = true) },
  { label: 'Log out', icon: 'lucide-log-out', onClick: signOut },
])

// Guard against double-submission: a fast double-click (or a stray double event)
// on "Create" would otherwise fire create() twice and insert two diagrams.
const isCreating = ref(false)
async function create() {
  if (isCreating.value) return
  isCreating.value = true
  try {
    // Every new diagram is a unified canvas now (canvas unification) — no type
    // picker; the user lands straight on the blank canvas and just starts drawing.
    const name = await createDiagram(undefined, null, 'unified', null)
    if (!name) throw new Error('Server returned no diagram name')
    diagrams.reload()
    // `new` selects the title for inline renaming on the fresh canvas.
    router.push({ name: 'Editor', params: { name }, query: { new: '1' } })
  } catch (error) {
    // Say why, in the UI. A refused create (the common case: no permission on
    // Draw Diagram) used to leave the empty state sitting there with the reason
    // only in the console (#174).
    console.error('Create diagram failed:', error)
    toast.error('Could not create the diagram', { text: errorMessage(error) })
  } finally {
    isCreating.value = false
  }
}

function open(name) {
  router.push({ name: 'Editor', params: { name } })
}
</script>

<template>
  <div class="flex h-screen flex-col">
    <!-- Top bar (#308): app identity + menu on the left, view switcher beside it.
         No sidebar — the gallery gets the full width. -->
    <header
      class="flex flex-none items-center gap-4 border-b border-outline-gray-1 bg-surface-base px-9 py-2"
    >
      <Dropdown :options="appMenu">
        <Button variant="ghost" theme="gray" size="md" :label="`Frappe Draw — ${fullName}`">
          <template #prefix><Logomark :size="22" /></template>
          <span class="text-base font-medium text-ink-gray-8">Frappe Draw</span>
          <template #suffix>
            <span class="lucide-chevron-down size-4 text-ink-gray-5" aria-hidden="true" />
          </template>
        </Button>
      </Dropdown>

      <TabButtons v-model="view" size="sm" :options="viewTabs" />
    </header>

    <main class="min-h-0 flex-1 overflow-y-auto px-9 py-7">
      <TrashView v-if="view === 'trash'" />

      <template v-else>
        <div class="mb-6 flex items-center justify-between">
          <div class="text-[22px] font-bold text-ink-gray-9">{{ title }}</div>
          <Button variant="solid" :loading="isCreating" @click="create">
            <template #prefix><LucideIcon name="plus" class="h-4 w-4" /></template>
            Create
          </Button>
        </div>

        <div
          v-if="showInstallDriveBanner"
          class="mb-6 flex items-center gap-3 rounded-lg border border-outline-gray-1 bg-surface-gray-1 px-4 py-3"
        >
          <LucideIcon name="hard-drive" class="h-5 w-5 shrink-0 text-ink-gray-6" />
          <div class="min-w-0 flex-1">
            <div class="text-base font-medium text-ink-gray-8">Install Drive to track your files</div>
            <div class="text-p-sm text-ink-gray-6">
              Your diagrams save to Draw. Add Frappe Drive to keep them alongside the rest of your files.
            </div>
          </div>
          <button
            aria-label="Dismiss"
            class="shrink-0 rounded p-1 text-ink-gray-5 hover:bg-surface-gray-3 hover:text-ink-gray-7"
            @click="bannerDismissed = true"
          >
            <LucideIcon name="x" class="h-4 w-4" />
          </button>
        </div>

        <EmptyState v-if="isEmpty" @create="create" />
        <TileGrid v-else :mode="view" @create="create" @open="open" />
      </template>
    </main>

    <SettingsDialog v-model:open="showSettings" />
  </div>
</template>
