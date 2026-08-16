<script setup>
// Home diagram browser (spec §2): a Pinned group and then every other diagram, in
// one flat list (no folders, #115; one listing view, #407).
//
// One toolbar row holds everything you do to the page — search, sort, the
// tile/list toggle and Create — and turns into a bulk-action bar while diagrams
// are selected (#449 item 12). At most MAX_PINNED pinned. Deleting from the bulk
// bar is optimistic and batched, see "trash (#402)" below.
//
// Collections (#217) were removed here: the strip was the only way to make one, so
// a Home without it could never have had any. The doctypes and their API are left
// in place, dormant, the way the folder doctype was (#115).
import { computed, reactive, ref, watch } from 'vue'
import { call, useList, dialog, Dialog, Button, Divider, Dropdown, Tooltip, TooltipProvider, TextInput } from 'frappe-ui'
import DiagramCollection from './DiagramCollection.vue'
import SelectAllCheckbox from './SelectAllCheckbox.vue'
import { useOptimisticTrash } from '@/composables/useOptimisticTrash.js'
import {
  pinnedOnly,
  unpinned,
  readLayout,
  writeLayout,
  emptyStateFor,
  searchDiagrams,
  sortDiagrams,
  defaultDirection,
  SORTS,
  DEFAULT_SORT,
} from '@/components/home/homeViews.js'
import { submitOrThrow } from '@/data/submit.js'
import { createDiagramDocument } from '@/diagram/schema.js'

defineProps({
  // True while HomeShell's create() is in flight, so the Create button here shows
  // the spinner for the request it started.
  creating: { type: Boolean, default: false },
})
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
// `icon` holds the COMPLETE lucide utility class: Tailwind's JIT only emits classes
// it can read literally, so one built as `lucide-${name}` renders blank.
const VIEW_OPTIONS = [
  { value: 'tile', label: 'Tile view', icon: 'lucide-grid-2x2' },
  { value: 'list', label: 'List view', icon: 'lucide-list' },
]
const query = ref('')
const sortKey = ref(DEFAULT_SORT)
// Direction for the sortable list-view column headers (#302). 'smart' ignores it
// (it has its own pinned-first order); the toolbar dropdown resets it to a default.
const sortDir = ref('desc')

const sortLabel = computed(() => SORTS.find((s) => s.key === sortKey.value)?.label || 'Sort')
// The chosen sort is ticked in the menu (#449 item 5): the control used to be an
// icon with a tooltip, which named the sort only while the pointer rested on it —
// so the list looked ordered by nothing in particular.
const sortOptions = computed(() =>
  SORTS.map((option) => ({
    label: option.label,
    icon: option.key === sortKey.value ? 'check' : null,
    onClick: () => setSort(option.key, defaultDirection(option.key)),
  })),
)

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
    sortDir.value = defaultDirection(key)
  }
}
// The arrow's complete lucide class for a column, or null when it isn't the
// active sort. A complete class because Tailwind's JIT reads it literally.
function sortArrow(key) {
  if (sortKey.value !== key) return null
  return sortDir.value === 'asc' ? 'lucide-chevron-up' : 'lucide-chevron-down'
}

// Search then sort, both from homeViews so the rules are testable on their own.
function arrange(rows) {
  return sortDiagrams(rows, sortKey.value, sortDir.value)
}

// Deleting is optimistic and batched (#402): the rows leave the shelf on click and
// one request settles the whole selection behind them, so `notTrashing` filters out
// the ones on their way to Trash before the reloaded list has caught up.
const { notTrashing, trashDiagrams } = useOptimisticTrash(refresh)

const visibleRows = computed(() =>
  searchDiagrams(rows.value.filter(notTrashing), query.value),
)

// Home: a Pinned group, then every other diagram (flat — no folders, #115).
const pinned = computed(() => arrange(pinnedOnly(visibleRows.value)))
const files = computed(() => arrange(unpinned(visibleRows.value)))
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
const hasActiveFilter = computed(() => Boolean(query.value.trim()))

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
}
</script>

<template>
  <div>
    <!-- Toolbar: a Find bar + sort, or a bulk-action bar when diagrams are
         selected; the view toggle sits at the far right. -->
    <div class="mb-5 flex h-9 items-center gap-2 px-3">
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
        <TextInput
          v-model="query"
          type="text"
          placeholder="Search diagrams"
          aria-label="Search diagrams"
          class="w-full max-w-xs"
        >
          <template #prefix><span class="lucide-search h-3.5 w-3.5 text-ink-gray-5" aria-hidden="true" /></template>
          <!-- The clear button only exists while there is something to clear, so
               the field is not carrying a dead control the rest of the time. -->
          <template v-if="query" #suffix>
            <button
              class="flex size-4 items-center justify-center rounded text-ink-gray-5 hover:text-ink-gray-7"
              aria-label="Clear search"
              @click="query = ''"
            >
              <span class="lucide-x size-3.5" aria-hidden="true" />
            </button>
          </template>
        </TextInput>

        <!-- The sort NAMES itself on the bar. It was an icon with a tooltip, so the
             order in front of you had no label until you hovered it (#449 item 5). -->
        <Dropdown :options="sortOptions" placement="bottom-start">
          <Button variant="ghost" :label="`Sort by ${sortLabel}`">
            <template #prefix>
              <span class="lucide-arrow-up-down size-4 text-ink-gray-5" aria-hidden="true" />
            </template>
            <span class="text-ink-gray-7">{{ sortLabel }}</span>
          </Button>
        </Dropdown>

        <div class="flex-1" />
      </template>

      <!-- Outside both branches: the view toggle is about the page, not about what
           is selected, so it stays put when the bar turns into the bulk bar. -->
      <!-- Two icon cells rather than TabButtons (#497). TabButtons sets a native
           `title` on any option it renders icon-only — and an option carrying
           `icon` IS icon-only — which is the flat grey OS tooltip, drawn wherever
           the pointer is and about a second late. Nothing a consumer passes turns
           it off. Same control the canvas tools use, so both surfaces match. -->
      <TooltipProvider>
        <div class="flex gap-1">
          <Tooltip v-for="option in VIEW_OPTIONS" :key="option.value" :text="option.label">
            <button
              class="flex h-7 w-7 items-center justify-center rounded-md"
              :class="view === option.value ? 'bg-surface-gray-3 text-ink-gray-9' : 'text-ink-gray-7 hover:bg-surface-gray-2'"
              :aria-label="option.label"
              :aria-pressed="view === option.value"
              @click="view = option.value"
            >
              <span class="h-4 w-4" aria-hidden="true" :class="option.icon" />
            </button>
          </Tooltip>
        </div>
      </TooltipProvider>

      <!-- The one primary action on the page, at the end of the row holding the
           controls it belongs with (#449 item 12). It steps aside for the bulk bar,
           where Delete is the action in play. -->
      <Button
        v-if="!selectedCount"
        variant="solid"
        :loading="creating"
        label="Create"
        @click="emit('create')"
      >
        <template #prefix><span class="lucide-plus size-4" aria-hidden="true" /></template>
        Create
      </Button>
    </div>

    <!-- List-view column header — aligns column-for-column with the flat rows. The
         master checkbox sits left; Name / Created / Last edited click to sort (#302). -->
    <!-- frappe-ui-exempt: column-header row, the table-header convention shared with DiagramTile's list row and the "Pinned"/"Diagrams" section labels below. Its lane widths must stay identical to the row's, or the labels sit off their columns (#449 item 9) --><div v-if="view === 'list'" class="mb-1 flex items-center gap-3 border-b border-outline-gray-1 px-3 pb-2 text-xs font-medium text-ink-gray-5">
      <span class="flex w-4 flex-none items-center justify-center">
        <SelectAllCheckbox
          v-if="currentDiagrams.length"
          :all-selected="allSelected"
          :some-selected="someSelected"
          @change="setAllSelected"
        />
      </span>
      <!-- Pin lane, the width of the Button that sits in it on every row. The
           type-icon lane that used to be here went with the icon (#218). -->
      <span class="w-7 flex-none" />
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
      <!-- frappe-ui-exempt: text-2xs group label, matching the list-view column header above --><div class="mb-2 px-3 text-2xs font-semibold text-ink-gray-5">Pinned</div>
      <DiagramCollection :diagrams="pinned" :view="view" :selected="selected" :pin-limit-reached="pinLimitReached" v-on="collectionHandlers" />
      <Divider class="my-3" />
      <!-- frappe-ui-exempt: text-2xs group label, matching the list-view column header above --><div class="mb-2 px-3 text-2xs font-semibold text-ink-gray-5">Diagrams</div>
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
