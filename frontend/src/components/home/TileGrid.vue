<script setup>
// Home diagram browser (spec §2). Modes chosen from the sidebar:
//   home   — Pinned group + the rest of the diagrams (flat, no folders)
//   recent — a flat list of the most-recently-edited diagrams
//   shared — diagrams others shared with me that I don't own (#116)
//   pinned — a flat list of just the pinned diagrams (#116)
// Toolbar offers search + sort + a tile/list toggle, becoming a bulk-action bar
// on selection. Creation is the top-right CTA only. At most MAX_PINNED pinned.
// Deleting from the bulk bar is optimistic and batched — see "trash (#402)" below.
import { computed, reactive, ref, watch } from 'vue'
import { call, useList, dialog, Dialog, Button, Divider, Dropdown, TabButtons, TextInput, Tooltip } from 'frappe-ui'
import DiagramCollection from './DiagramCollection.vue'
import CollectionChips from './CollectionChips.vue'
import CollectionPicker from './CollectionPicker.vue'
import SelectAllCheckbox from './SelectAllCheckbox.vue'
import { listCollections, diagramsInCollection } from '@/data/collections.js'
import { useOptimisticTrash } from '@/composables/useOptimisticTrash.js'
import {
  pinnedOnly,
  unpinned,
  readLayout,
  writeLayout,
  emptyStateFor,
} from '@/components/home/homeViews.js'
import { submitOrThrow } from '@/data/submit.js'
import { createDiagramDocument } from '@/diagram/schema.js'

const emit = defineEmits(['create', 'open', 'changed'])

const MAX_PINNED = 5

// `refetch: false` keeps writes from triggering their own list reload — every
// mutation here already ends in an explicit refresh(), so the default would
// re-fetch twice per change (and once per diagram during a bulk delete).
const enriched = useList({
  doctype: 'Draw Diagram',
  // `thumbnail` is the saved raster preview shown on tiles. `document` is NOT here:
  // carrying every diagram's full JSON made this response about nine times larger,
  // to serve a live preview that only the diagrams without a raster ever need (#223).
  fields: ['name', 'title', 'creation', 'modified', 'diagram_type', 'is_pinned', 'owner', 'thumbnail'],
  filters: { is_trashed: 0 },
  orderBy: 'modified desc',
  limit: 500,
  refetch: false,
})

// The live-SVG fallback, fetched for exactly the diagrams that need it: those with
// no saved thumbnail. In a library where diagrams have been opened and saved that
// is almost none, so this second request usually comes back empty. An emptied
// diagram has its thumbnail cleared on save, so "no raster" is the whole answer —
// a tile never needs a document to know it is blank.
const previewDocuments = useList({
  doctype: 'Draw Diagram',
  fields: ['name', 'document'],
  filters: { is_trashed: 0, thumbnail: ['is', 'not set'] },
  limit: 500,
  refetch: false,
})
const documentsByName = computed(() =>
  Object.fromEntries((previewDocuments.data || []).map((d) => [d.name, d.document])),
)

// Merge each thumbnail-less diagram's document back onto its row, so the tiles
// keep reading `diagram.document` and only the fetching changed. A row whose
// document has not arrived yet leaves the key undefined, which the tile reads as
// "not known yet" rather than "blank".
const rows = computed(() => {
  const documents = documentsByName.value
  return (enriched.data || []).map((row) =>
    row.thumbnail ? row : { ...row, document: documents[row.name] },
  )
})
const pinnedTotal = computed(() => rows.value.filter((d) => d.is_pinned).length)
const pinLimitReached = computed(() => pinnedTotal.value >= MAX_PINNED)

// --- view / search / sort --------------------------------------------------
// The tile/list choice survives a reload (#222). Someone who switches to tiles and
// comes back to a list has to switch again on every visit — and, seeing no previews,
// reads it as thumbnails having stopped working (#221).
const view = ref(readLayout())
watch(view, writeLayout)
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
// The arrow's complete lucide class for a column, or null when it isn't the
// active sort. A complete class because Tailwind's JIT reads it literally.
function sortArrow(key) {
  if (sortKey.value !== key) return null
  return sortDir.value === 'asc' ? 'lucide-chevron-up' : 'lucide-chevron-down'
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

// --- collections (#217) ----------------------------------------------------
// Labels, not folders: the chip row narrows the SAME list rather than navigating
// into anything, so a diagram in two collections shows under both. With one
// listing view (#407) the chips are always available.
const collections = ref([])
const activeCollection = ref('')
const collectedNames = ref(null) // null = no collection filter
const collecting = ref(null) // the diagram whose "Add to collection" dialog is open

async function loadCollections() {
  collections.value = await listCollections()
  // A chip can disappear underneath the filter (deleted elsewhere, or by us).
  if (activeCollection.value && !collections.value.some((c) => c.name === activeCollection.value)) {
    selectCollection('')
  }
}

async function selectCollection(name) {
  activeCollection.value = name
  collectedNames.value = name ? new Set(await diagramsInCollection(name)) : null
}

// Re-read the membership when a chip is filtering and something changed under it.
async function refreshCollections() {
  await loadCollections()
  if (activeCollection.value) await selectCollection(activeCollection.value)
}

loadCollections()

function matchesCollection(diagram) {
  return !collectedNames.value || collectedNames.value.has(diagram.name)
}

// Deleting is optimistic and batched (#402): the rows leave the shelf on click and
// one request settles the whole selection behind them, so `notTrashing` filters out
// the ones on their way to Trash before the reloaded list has caught up.
const { notTrashing, trashDiagrams } = useOptimisticTrash(refresh)

const visibleRows = computed(() =>
  rows.value.filter((d) => notTrashing(d) && matchesQuery(d) && matchesCollection(d)),
)

// Home: a Pinned group, then every other diagram (flat — no folders, #115).
const pinned = computed(() => pinnedOnly(visibleRows.value).sort(bySort))
const files = computed(() => unpinned(visibleRows.value).sort(bySort))
const hasPinnedSection = computed(() => pinned.value.length > 0)

// --- selection + bulk delete ----------------------------------------------
const selected = reactive(new Set())
const selectedCount = computed(() => selected.size)
// Set the wanted state rather than flipping the current one. frappe-ui's Checkbox
// emits update:modelValue twice per click (#405), and a flip run twice is a no-op —
// which is why clicking a tile's checkbox used to do nothing at all.
function setSelected(name, wanted) {
  if (wanted) selected.add(name)
  else selected.delete(name)
}
function clearSelection() {
  selected.clear()
}

// The diagrams on screen, so Select all grabs exactly those.
const currentDiagrams = computed(() => [...pinned.value, ...files.value])
// Nothing on the shelf (a search excluded everything — the truly-empty home
// renders HomeShell's EmptyState instead of this grid).
const nothingHere = computed(() => !currentDiagrams.value.length)
const hasActiveFilter = computed(() => Boolean(query.value.trim()) || Boolean(activeCollection.value))

// A search that matched nothing wants different words (and glyph) than a fresh,
// unused Home.
const emptyState = computed(() => emptyStateFor(hasActiveFilter.value))
const allSelected = computed(() => {
  const diagrams = currentDiagrams.value
  return diagrams.length > 0 && diagrams.every((d) => selected.has(d.name))
})
// Some-but-not-all selected → the master checkbox shows Gmail's indeterminate dash.
const someSelected = computed(() => selectedCount.value > 0 && !allSelected.value)
// Gmail behaviour: any selection → the master box clears it; nothing selected →
// it takes everything on screen. Idempotent for the same reason setSelected is.
function setAllSelected(wanted) {
  clearSelection()
  if (wanted) currentDiagrams.value.forEach((d) => selected.add(d.name))
}

// The selection empties as the rows go, so the bulk bar collapses back to the
// search field in the same frame rather than sitting there over nothing.
function deleteSelected() {
  const names = [...selected]
  clearSelection()
  trashDiagrams(names)
}
function trash(diagram) {
  trashDiagrams([diagram.name])
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

// The list no longer carries documents (#223), so read the source's on demand.
// A diagram with a saved thumbnail never has one on its row.
async function duplicate(diagram) {
  const source = await call('frappe.client.get_value', {
    doctype: 'Draw Diagram',
    filters: { name: diagram.name },
    fieldname: 'document',
  })
  const document = source?.document || diagram.document || createDiagramDocument()
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

// Awaitable so the optimistic trash can hold its rows hidden until the reloaded
// list agrees they are gone, instead of flashing them back in the gap (#402).
function refresh() {
  emit('changed')
  return Promise.all([
    enriched.reload(),
    // A save may have added or cleared a thumbnail, which changes which diagrams
    // still need their document fetched.
    previewDocuments.reload(),
  ])
}

const collectionHandlers = {
  open: (name) => emit('open', name),
  select: setSelected,
  'toggle-pin': togglePin,
  rename: startRename,
  duplicate,
  delete: trash,
  'show-info': startInfo,
  collect: (diagram) => (collecting.value = diagram),
}
</script>

<template>
  <div>
    <!-- Toolbar: a Find bar + sort, or a bulk-action bar when diagrams are
         selected; the view toggle sits at the far right. -->
    <div class="mb-5 flex h-9 items-center gap-2">
      <!-- In list view the master checkbox lives in the table header (left of
           Name); in tile view there's no header row, so it sits here. -->
      <!-- Spacing lives on the wrapper: frappe-ui's Checkbox has no
           `inheritAttrs: false`, so a class passed to it lands on both its root
           element and the control inside, doubling the margin. -->
      <span v-if="view === 'tile' && currentDiagrams.length" class="ml-1 mr-1 flex flex-none items-center">
        <SelectAllCheckbox
          :all-selected="allSelected"
          :some-selected="someSelected"
          @change="setAllSelected"
        />
      </span>

      <template v-if="selectedCount">
        <span class="text-sm font-semibold text-ink-gray-9">{{ selectedCount }} selected</span>
        <Button variant="subtle" theme="red" @click="deleteSelected">
          <template #prefix><span class="lucide-trash-2 h-4 w-4" aria-hidden="true" /></template>
          Delete
        </Button>
        <Button variant="ghost" @click="clearSelection">Clear</Button>
        <div class="flex-1" />
      </template>

      <template v-else>
        <TextInput v-model="query" type="text" placeholder="Find a diagram" class="max-w-md flex-1">
          <template #prefix><span class="lucide-search h-3.5 w-3.5 text-ink-gray-5" aria-hidden="true" /></template>
        </TextInput>
        <Dropdown :options="sortOptions" placement="bottom-start">
          <Tooltip :text="`Sort: ${sortLabel}`">
            <Button variant="subtle" :aria-label="`Sort: ${sortLabel}`">
              <span class="lucide-arrow-up-down h-4 w-4" aria-hidden="true" />
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

    <CollectionChips
      :collections="collections"
      :active="activeCollection"
      @select="selectCollection"
      @changed="refreshCollections"
    />

    <!-- List-view column header — aligns column-for-column with the flat rows. The
         master checkbox sits left; Name / Created / Last edited click to sort (#302). -->
    <!-- frappe-ui-exempt: text-2xs column-header row, the table-header convention shared with DiagramTile's list row and the "Pinned"/"Diagrams" section labels below --><div v-if="view === 'list'" class="mb-1 flex items-center gap-3 border-b border-outline-gray-1 px-3 pb-2 text-2xs font-medium text-ink-gray-5">
      <span class="flex w-4 flex-none items-center justify-center">
        <SelectAllCheckbox
          v-if="currentDiagrams.length"
          :all-selected="allSelected"
          :some-selected="someSelected"
          @change="setAllSelected"
        />
      </span>
      <!-- Pin lane. The type-icon lane that sat here is gone with the icon (#218). -->
      <span class="w-6 flex-none" />
      <!-- frappe-ui-exempt: sortable column label, not a control — Button's own height, padding and background would break the column alignment with the rows beneath --><button class="flex min-w-0 flex-1 items-center gap-1 hover:text-ink-gray-7" @click="setSort('title')">
        Name
        <span v-if="sortArrow('title')" class="h-3 w-3 flex-none" aria-hidden="true" :class="sortArrow('title')" />
      </button>
      <span class="hidden w-28 flex-none lg:block">Owner</span>
      <!-- frappe-ui-exempt: sortable column label — see the Name column above --><button class="hidden w-28 flex-none items-center gap-1 hover:text-ink-gray-7 md:flex" @click="setSort('creation')">
        Created
        <span v-if="sortArrow('creation')" class="h-3 w-3 flex-none" aria-hidden="true" :class="sortArrow('creation')" />
      </button>
      <!-- frappe-ui-exempt: sortable column label — see the Name column above --><button class="hidden w-28 flex-none items-center gap-1 hover:text-ink-gray-7 sm:flex" @click="setSort('modified')">
        Last edited
        <span v-if="sortArrow('modified')" class="h-3 w-3 flex-none" aria-hidden="true" :class="sortArrow('modified')" />
      </button>
      <span class="w-7 flex-none" />
    </div>

    <!-- A titled Pinned group (when anything is pinned), then the rest. -->
    <template v-if="hasPinnedSection">
      <!-- frappe-ui-exempt: text-2xs group label, matching the list-view column header above --><div class="mb-2 text-2xs font-semibold text-ink-gray-5">Pinned</div>
      <DiagramCollection :diagrams="pinned" :view="view" :selected="selected" :pin-limit-reached="pinLimitReached" v-on="collectionHandlers" />
      <Divider class="my-3" />
      <!-- frappe-ui-exempt: text-2xs group label, matching the list-view column header above --><div class="mb-2 text-2xs font-semibold text-ink-gray-5">Diagrams</div>
    </template>

    <DiagramCollection v-if="files.length" :diagrams="files" :view="view" :selected="selected" :pin-limit-reached="pinLimitReached" v-on="collectionHandlers" />

    <!-- Empty shelf — worded for a search that matched nothing vs. a fresh Home. -->
    <div v-if="nothingHere" class="flex flex-col items-center gap-3 py-20 text-center">
      <div class="flex h-12 w-12 items-center justify-center rounded-full bg-surface-gray-2">
        <span class="h-5 w-5 text-ink-gray-5" aria-hidden="true" :class="emptyState.icon" />
      </div>
      <div>
        <p class="text-base font-semibold text-ink-gray-8">{{ emptyState.title }}</p>
        <p class="mt-0.5 text-sm text-ink-gray-5">{{ emptyState.hint }}</p>
      </div>
    </div>

    <CollectionPicker
      :diagram="collecting"
      :collections="collections"
      @close="collecting = null"
      @changed="refreshCollections"
    />

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
