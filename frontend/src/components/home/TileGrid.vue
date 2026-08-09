<script setup>
// Home diagram browser (spec §2). Modes chosen from the sidebar:
//   home   — Pinned group + the rest of the diagrams (flat, no folders)
//   recent — a flat list of the most-recently-edited diagrams
//   shared — diagrams others shared with me that I don't own (#116)
//   pinned — a flat list of just the pinned diagrams (#116)
// Toolbar offers search + sort + a tile/list toggle, becoming a bulk-action bar
// on selection. Creation is the top-right CTA only. At most MAX_PINNED pinned.
import { computed, reactive, ref, watch, watchEffect } from 'vue'
import { useCall, useList, dialog, toast, Dialog, Button, Divider, Dropdown, TabButtons, TextInput, Tooltip } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import DiagramCollection from './DiagramCollection.vue'
import { pinnedOnly, unpinned } from '@/components/home/homeViews.js'
import { submitOrThrow } from '@/data/submit.js'
import { createDiagramDocument } from '@/diagram/schema.js'

const props = defineProps({
  mode: { type: String, default: 'home' }, // 'home' | 'recent' | 'shared' | 'pinned'
})
const emit = defineEmits(['create', 'open', 'changed'])

const MAX_PINNED = 5
const RECENT_LIMIT = 24

// `refetch: false` keeps writes from triggering their own list reload — every
// mutation here already ends in an explicit refresh(), so the default would
// re-fetch twice per change (and once per diagram during a bulk delete).
const enriched = useList({
  doctype: 'Draw Diagram',
  // `thumbnail` is the saved raster preview shown on tiles; `document` stays for the
  // live-SVG fallback when a (non-empty) diagram has no thumbnail yet, and for duplicate.
  fields: ['name', 'title', 'creation', 'modified', 'diagram_type', 'is_pinned', 'owner', 'document', 'thumbnail'],
  filters: { is_trashed: 0 },
  orderBy: 'modified desc',
  limit: 500,
  refetch: false,
})

// "Shared with you" can't be a plain list filter — it joins DocShare and excludes
// the owner — so it comes from a dedicated endpoint (draw.api.diagram.shared_with_me),
// fetched lazily the first time that view is opened.
const shared = useCall({ url: '/api/v2/method/draw.api.diagram.shared_with_me', immediate: false })
watch(
  () => props.mode,
  (mode) => {
    if (mode === 'shared') shared.fetch()
  },
  { immediate: true },
)

const rows = computed(() => enriched.data || [])
const pinnedTotal = computed(() => rows.value.filter((d) => d.is_pinned).length)
const pinLimitReached = computed(() => pinnedTotal.value >= MAX_PINNED)

// --- view / search / sort --------------------------------------------------
const view = ref('list')
const query = ref('')
const sortKey = ref('modified')
// Direction for the sortable list-view column headers (#302). 'smart' ignores it
// (it has its own pinned-first order); the toolbar dropdown resets it to a default.
const sortDir = ref('desc')

function matchesQuery(diagram) {
  const q = query.value.trim().toLowerCase()
  return !q || (diagram.title || '').toLowerCase().includes(q)
}

const SORTS = [
  { key: 'smart', label: 'Smart' },
  { key: 'modified', label: 'Last edited' },
  { key: 'creation', label: 'Date created' },
  { key: 'title', label: 'Name (A–Z)' },
]
const sortLabel = computed(() => SORTS.find((s) => s.key === sortKey.value)?.label || 'Sort')
const sortOptions = computed(() =>
  SORTS.map((s) => ({ label: s.label, onClick: () => setSort(s.key, defaultDir(s.key)) })),
)

// Names read A→Z; every other key is newest-first by default.
function defaultDir(key) {
  return key === 'title' ? 'asc' : 'desc'
}
// A sortable column header: with an explicit `dir` (dropdown) set that; otherwise
// clicking the active column flips direction, a new column sorts in its default.
function setSort(key, dir = null) {
  if (dir) {
    sortKey.value = key
    sortDir.value = dir
  } else if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = defaultDir(key)
  }
}
// The arrow lucide name for a column, or null when it isn't the active sort.
function sortArrow(key) {
  if (sortKey.value !== key) return null
  return sortDir.value === 'asc' ? 'chevron-up' : 'chevron-down'
}

function ts(value) {
  return value ? new Date(value.replace(' ', 'T')).getTime() : 0
}
function bySort(a, b) {
  // Smart: surface what you'd likely want next — pinned first, then most recently
  // edited. (Without open-frequency data this is the best local heuristic; I6.)
  if (sortKey.value === 'smart') {
    const pin = (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0)
    return pin || ts(b.modified) - ts(a.modified)
  }
  const dir = sortDir.value === 'asc' ? 1 : -1
  if (sortKey.value === 'title') return dir * (a.title || '').localeCompare(b.title || '')
  return dir * (ts(a[sortKey.value]) - ts(b[sortKey.value]))
}
function byNewest(a, b) {
  return ts(b.modified) - ts(a.modified)
}

const visibleRows = computed(() => rows.value.filter((d) => matchesQuery(d)))

// Home: a Pinned group, then every other diagram (flat — no folders, #115).
const pinned = computed(() => pinnedOnly(visibleRows.value).sort(bySort))
const files = computed(() => unpinned(visibleRows.value).sort(bySort))
const hasPinnedSection = computed(() => pinned.value.length > 0)

// Recent is the newest slice of my library; the Pinned view reuses the same pinned
// group Home shows. "Shared with you" is its own resource (search-filtered here).
const recentList = computed(() => [...visibleRows.value].sort(byNewest).slice(0, RECENT_LIMIT))
const sharedList = computed(() => (shared.data || []).filter((d) => matchesQuery(d)).sort(bySort))

// The single flat list a non-home view renders.
const modeList = computed(() => {
  if (props.mode === 'recent') return recentList.value
  if (props.mode === 'shared') return sharedList.value
  if (props.mode === 'pinned') return pinned.value
  return []
})

// --- selection + bulk delete ----------------------------------------------
const selected = reactive(new Set())
const selectedCount = computed(() => selected.size)
function toggleSelect(name) {
  if (selected.has(name)) selected.delete(name)
  else selected.add(name)
}
function clearSelection() {
  selected.clear()
}

// The diagrams selectable in the current view, so Select all grabs what's on screen.
const currentDiagrams = computed(() => {
  if (props.mode === 'home') return [...pinned.value, ...files.value]
  return modeList.value
})
// Current view shows nothing (a search excluded everything — the truly-empty home
// renders HomeShell's EmptyState instead of this grid).
const nothingHere = computed(() => !currentDiagrams.value.length)
const hasActiveFilter = computed(() => Boolean(query.value.trim()))

// The empty state speaks to the view you're in: a filtered search vs. an empty
// Shared / Pinned tab want different words (and glyph) than a fresh, unused Home.
const EMPTY_STATES = {
  shared: { icon: 'share-2', title: 'Nothing shared with you', hint: 'Diagrams others share with you show up here.' },
  pinned: { icon: 'pin', title: 'No pinned diagrams', hint: 'Pin a diagram to keep it handy here.' },
}
const emptyState = computed(() => {
  if (hasActiveFilter.value) return { icon: 'search', title: 'No diagrams match', hint: 'Try a different search.' }
  return EMPTY_STATES[props.mode] || { icon: 'feather', title: 'Nothing here yet', hint: 'Create a diagram to get started.' }
})
const allSelected = computed(() => {
  const diagrams = currentDiagrams.value
  return diagrams.length > 0 && diagrams.every((d) => selected.has(d.name))
})
// Some-but-not-all selected → the master checkbox shows Gmail's indeterminate dash.
const someSelected = computed(() => selectedCount.value > 0 && !allSelected.value)
function selectAll() {
  currentDiagrams.value.forEach((d) => selected.add(d.name))
}
// Gmail behaviour: any selection → click clears; nothing selected → select all.
function toggleSelectAll() {
  if (selectedCount.value > 0) clearSelection()
  else selectAll()
}

// Native checkbox has no reactive `indeterminate` prop — set it on the element.
const masterCheckbox = ref(null)
watchEffect(() => {
  if (masterCheckbox.value) masterCheckbox.value.indeterminate = someSelected.value
})

function askDelete(names) {
  const n = names.length
  dialog.confirm({
    title: 'Move to Trash?',
    message: `Move ${n} diagram${n === 1 ? '' : 's'} to Trash? You can restore ${n === 1 ? 'it' : 'them'} from Trash.`,
    theme: 'red',
    confirmLabel: 'Delete',
    onConfirm: async () => {
      try {
        for (const name of names) {
          await submitOrThrow(enriched.setValue, { name, is_trashed: 1, trashed_on: frappeNow() })
        }
        toast.success(`Moved ${n} diagram${n === 1 ? '' : 's'} to Trash`)
      } finally {
        // Always clear and refresh, even if a delete errored, so the list can
        // never be left showing a diagram that is already trashed.
        clearSelection()
        refresh()
      }
    },
  })
}
function deleteSelected() {
  askDelete([...selected])
}
function trash(diagram) {
  askDelete([diagram.name])
}

// --- pin / rename / duplicate ---------------------------------------------
async function togglePin(diagram) {
  if (!diagram.is_pinned && pinLimitReached.value) return
  await submitOrThrow(enriched.setValue, { name: diagram.name, is_pinned: diagram.is_pinned ? 0 : 1 })
  refresh()
}

function startRename(diagram) {
  dialog.prompt({
    title: 'Rename diagram',
    confirmLabel: 'Save',
    fields: [{ name: 'title', label: 'Title', required: true, defaultValue: diagram.title }],
    onConfirm: async ({ values }) => {
      await submitOrThrow(enriched.setValue, { name: diagram.name, title: values.title })
      refresh()
    },
  })
}

async function duplicate(diagram) {
  const document = diagram.document || createDiagramDocument()
  await submitOrThrow(enriched.insert, { title: `${diagram.title} copy`, document })
  refresh()
}

// --- show info (I5) --------------------------------------------------------
const info = reactive({ open: false, diagram: null })
function startInfo(diagram) {
  Object.assign(info, { open: true, diagram })
}
const infoRows = computed(() => {
  const d = info.diagram
  if (!d) return []
  return [
    ['Name', d.title],
    ['Owner', d.owner || '—'],
    ['Created', d.creation ? d.creation.slice(0, 16).replace(' ', ' · ') : '—'],
    ['Last edited', d.modified ? d.modified.slice(0, 16).replace(' ', ' · ') : '—'],
  ]
})

function refresh() {
  enriched.reload()
  // Keep the Shared view live after an action taken from it (e.g. duplicate).
  if (props.mode === 'shared') shared.fetch()
  emit('changed')
}
function frappeNow() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

const collectionHandlers = {
  open: (name) => emit('open', name),
  'toggle-select': toggleSelect,
  'toggle-pin': togglePin,
  rename: startRename,
  duplicate,
  delete: trash,
  'show-info': startInfo,
}
</script>

<template>
  <div>
    <!-- Toolbar: a Find bar + sort, or a bulk-action bar when diagrams are
         selected; the view toggle sits at the far right. -->
    <div class="mb-5 flex h-9 items-center gap-2">
      <!-- In list view the master checkbox lives in the table header (left of
           Name); in tile view there's no header row, so it sits here. -->
      <Tooltip v-if="view === 'tile'" :text="allSelected || someSelected ? 'Clear selection' : 'Select all'">
        <input
          v-if="currentDiagrams.length"
          ref="masterCheckbox"
          type="checkbox"
          :checked="allSelected"
          class="ml-1 mr-1 h-4 w-4 flex-none cursor-pointer [accent-color:var(--ink-gray-9)]"
          :aria-label="allSelected || someSelected ? 'Clear selection' : 'Select all'"
          @change="toggleSelectAll"
        />
      </Tooltip>

      <template v-if="selectedCount">
        <span class="text-sm font-semibold text-ink-gray-9">{{ selectedCount }} selected</span>
        <Button variant="subtle" theme="red" @click="deleteSelected">
          <template #prefix><LucideIcon name="trash-2" class="h-4 w-4" /></template>
          Delete
        </Button>
        <Button variant="ghost" @click="clearSelection">Clear</Button>
        <div class="flex-1" />
      </template>

      <template v-else>
        <TextInput v-model="query" type="text" placeholder="Find a diagram" class="max-w-md flex-1">
          <template #prefix><LucideIcon name="search" class="h-3.5 w-3.5 text-ink-gray-5" /></template>
        </TextInput>
        <Dropdown :options="sortOptions" placement="bottom-start">
          <Tooltip :text="`Sort: ${sortLabel}`">
            <Button variant="subtle" :aria-label="`Sort: ${sortLabel}`">
              <LucideIcon name="arrow-up-down" class="h-4 w-4" />
            </Button>
          </Tooltip>
        </Dropdown>
      </template>

      <TabButtons
        v-model="view"
        class="ml-auto"
        size="sm"
        :options="[
          { value: 'tile', label: 'Tile view', icon: 'lucide-grid-2x2' },
          { value: 'list', label: 'List view', icon: 'lucide-list' },
        ]"
      />
    </div>

    <!-- List-view column header — aligns column-for-column with the flat rows. The
         master checkbox sits left; Name / Created / Last edited click to sort (#302). -->
    <div
      v-if="view === 'list'"
      class="mb-1 flex items-center gap-3 border-b border-outline-gray-1 px-3 pb-2 text-2xs font-medium text-ink-gray-5"
    >
      <span class="flex w-4 flex-none items-center justify-center">
        <Tooltip :text="allSelected || someSelected ? 'Clear selection' : 'Select all'">
          <input
            v-if="currentDiagrams.length"
            ref="masterCheckbox"
            type="checkbox"
            :checked="allSelected"
            class="h-4 w-4 cursor-pointer [accent-color:var(--ink-gray-9)]"
            :aria-label="allSelected || someSelected ? 'Clear selection' : 'Select all'"
            @change="toggleSelectAll"
          />
        </Tooltip>
      </span>
      <span class="w-6 flex-none" />
      <span class="w-8 flex-none" />
      <button class="flex min-w-0 flex-1 items-center gap-1 hover:text-ink-gray-7" @click="setSort('title')">
        Name
        <LucideIcon v-if="sortArrow('title')" :name="sortArrow('title')" class="h-3 w-3 flex-none" />
      </button>
      <span class="hidden w-28 flex-none lg:block">Owner</span>
      <button class="hidden w-28 flex-none items-center gap-1 hover:text-ink-gray-7 md:flex" @click="setSort('creation')">
        Created
        <LucideIcon v-if="sortArrow('creation')" :name="sortArrow('creation')" class="h-3 w-3 flex-none" />
      </button>
      <button class="hidden w-28 flex-none items-center gap-1 hover:text-ink-gray-7 sm:flex" @click="setSort('modified')">
        Last edited
        <LucideIcon v-if="sortArrow('modified')" :name="sortArrow('modified')" class="h-3 w-3 flex-none" />
      </button>
      <span class="w-7 flex-none" />
    </div>

    <!-- HOME: a titled Pinned group (when anything is pinned), then the rest. -->
    <template v-if="mode === 'home'">
      <template v-if="hasPinnedSection">
        <div class="mb-2 text-2xs font-semibold text-ink-gray-5">Pinned</div>
        <DiagramCollection :diagrams="pinned" :view="view" :selected="selected" :pin-limit-reached="pinLimitReached" v-on="collectionHandlers" />
        <Divider class="my-3" />
        <div class="mb-2 text-2xs font-semibold text-ink-gray-5">Diagrams</div>
      </template>

      <DiagramCollection v-if="files.length" :diagrams="files" :view="view" :selected="selected" :pin-limit-reached="pinLimitReached" v-on="collectionHandlers" />
    </template>

    <!-- RECENT / SHARED / PINNED: a single flat list. (Only these modes — home
         renders its own grouped view above; v-else-if keeps it from double-
         rendering there.) -->
    <DiagramCollection
      v-else-if="mode !== 'home'"
      :diagrams="modeList"
      :view="view"
      :selected="selected"
      :pin-limit-reached="pinLimitReached"
      v-on="collectionHandlers"
    />

    <!-- Empty view — worded for the current tab (search / Shared / Pinned / Home). -->
    <div v-if="nothingHere" class="flex flex-col items-center gap-3 py-20 text-center">
      <div class="flex h-12 w-12 items-center justify-center rounded-full bg-surface-gray-2">
        <LucideIcon :name="emptyState.icon" class="h-5 w-5 text-ink-gray-5" />
      </div>
      <div>
        <p class="text-base font-semibold text-ink-gray-8">{{ emptyState.title }}</p>
        <p class="mt-0.5 text-xs text-ink-gray-5">{{ emptyState.hint }}</p>
      </div>
    </div>

    <!-- Quiet end-of-page marker (only when the view actually has content). -->
    <div v-if="!nothingHere" class="mt-16 flex flex-col items-center gap-2 py-10 text-center">
      <LucideIcon name="feather" class="h-6 w-6 text-ink-gray-3" />
      <p class="text-xs text-ink-gray-4">You've reached the end · made with Frappe Draw</p>
    </div>

    <!-- Show info (I5): read-only metadata. -->
    <Dialog v-model:open="info.open" title="Diagram info">
      <template #default>
        <dl class="grid grid-cols-[92px_1fr] gap-x-3 gap-y-2 text-sm">
          <template v-for="[label, value] in infoRows" :key="label">
            <dt class="text-ink-gray-5">{{ label }}</dt>
            <dd class="truncate text-ink-gray-8">{{ value }}</dd>
          </template>
        </dl>
      </template>
    </Dialog>
  </div>
</template>
