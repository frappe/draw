<script setup>
// Home page — composes the tile grid (+ empty state) + trash view, and routes to
// the editor on create/open (spec §2). "Create" makes a unified canvas and lands
// straight on the editor — no type picker (canvas unification). No folders
// (#115): diagrams are one flat, pinnable list.
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Breadcrumbs, Button, Dropdown, toast } from 'frappe-ui'
import { errorMessage } from '@/utils/errorText.js'
import Logomark from '@/components/Logomark.vue'
import SettingsDialog from '@/components/home/SettingsDialog.vue'
import TileGrid from '@/components/home/TileGrid.vue'
import EmptyState from '@/components/home/EmptyState.vue'
import TrashView from '@/components/home/TrashView.vue'
import { diagrams, createDiagram } from '@/data/diagrams.js'
import { logout } from '@/data/session.js'

const router = useRouter()
// The whole library is Home; Trash is the one place apart from it (#407).
const view = ref('home')

onMounted(() => {
  diagrams.fetch()
})

const list = computed(() => diagrams.data || [])
const isEmpty = computed(() => list.value.length === 0)

// Trash is the only place left to navigate to, so it is a breadcrumb rather than
// a bar of tabs (#407): Home is the whole library, and the trail only appears
// once you have stepped out of it.
const inTrash = computed(() => view.value === 'trash')
const breadcrumbs = [{ label: 'Home', onClick: () => (view.value = 'home') }, { label: 'Trash' }]

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

// The account menu: Trash, Settings, Log out. Trash lives here now that the view
// switcher is gone (#407) — it is the one view Home does not already contain.
//
// ONE group, so there is no divider (#461). The divider was the boundary between
// the two groups this used to have, not a separator anyone added, so collapsing
// them removes it; there is nothing to delete.
//
// "Apps" is gone with them. The idea was to grow it into a side menu of Suite apps,
// the way Frappe Mail does, and the mechanism was there — frappe-ui's Dropdown
// nests through a `submenu:` array, and `frappe.apps.get_apps` returns every
// installed app that declares add_to_apps_screen. The CONTENT was the problem: the
// individual Suite apps are modules inside one `suite` app, not separate installs,
// so a live list returns a single "Frappe Suite" row rather than the Writer /
// Slides / Sheets list the reference shows. On this bench the whole menu would have
// been two entries.
const appMenu = computed(() => [
  {
    group: 'Account',
    hideLabel: true,
    options: [
      { label: 'Trash', icon: 'lucide-trash-2', onClick: () => (view.value = 'trash') },
      { label: 'Settings', icon: 'lucide-settings', onClick: () => (showSettings.value = true) },
      { label: 'Log out', icon: 'lucide-log-out', onClick: signOut },
    ],
  },
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
    <!-- Top bar: app identity + menu, and nothing else (#407). Home is the whole
         library, so it needs no navigation of its own; the trail appears only in
         Trash, to lead back. No sidebar — the gallery gets the full width.
         The rule spans the window, but its contents sit in the same container as
         the list below, so the app name starts on the page's own left edge
         (#449 item 9). -->
    <header class="flex-none border-b border-outline-gray-1 bg-surface-base">
      <div class="mx-auto flex w-full max-w-6xl items-center gap-4 px-6 py-2 sm:px-8">
        <Dropdown :options="appMenu">
          <Button variant="ghost" theme="gray" size="md" :label="`Frappe Draw — ${fullName}`">
            <template #prefix><Logomark :size="22" /></template>
            <span class="text-base font-medium text-ink-gray-8">Frappe Draw</span>
            <template #suffix>
              <span class="lucide-chevron-down size-4 text-ink-gray-5" aria-hidden="true" />
            </template>
          </Button>
        </Dropdown>

        <Breadcrumbs v-if="inTrash" :items="breadcrumbs" />
      </div>
    </header>

    <!-- One page container, so the toolbar, the column headers and every row share
         the same left and right edge (#449 items 8/9). The width is capped and
         centred, the way Gameplan does it: a library list stretched across a wide
         monitor puts the name and its dates a screen apart. -->
    <main class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto w-full max-w-6xl px-6 py-6 sm:px-8">
        <TrashView v-if="inTrash" />

        <!-- No page heading (#449 item 1): the list is the page, and the app menu
             above already says where you are. No Drive card either — the nudge went
             with it. -->
        <template v-else>
          <EmptyState v-if="isEmpty" @create="create" />
          <TileGrid v-else :creating="isCreating" @create="create" @open="open" />
        </template>
      </div>
    </main>

    <SettingsDialog v-model:open="showSettings" />
  </div>
</template>
