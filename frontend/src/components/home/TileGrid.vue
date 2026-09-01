<script setup>
// Home diagram browser (spec §2): every diagram in one flat list (no folders,
// #115; no pinning, #541; one listing view, #407).
//
// One toolbar row holds search, the tile/list toggle and (via HomeShell) sits
// under the page header that carries Create (#541 item 5) — see HomeShell.vue.
// It turns into a bulk-action bar while diagrams are selected (#449 item 12).
// Deleting from the bulk bar is optimistic and batched, see "trash (#402)" below.
//
// Sorting lives on the list view's column headers (#541 item 1) — DiagramListView
// owns the header markup; this component only holds the sortKey/sortDir state
// and the comparator both views share.
//
// Collections (#217) were removed here: the strip was the only way to make one, so
// a Home without it could never have had any. The doctypes and their API are left
// in place, dormant, the way the folder doctype was (#115).
import { computed, reactive, ref, watch } from 'vue'
import { call, useList, dialog, Dialog, Button, Tooltip, TooltipProvider, TextInput, toast } from 'frappe-ui'
import DiagramCollection from './DiagramCollection.vue'
import DiagramListView from './DiagramListView.vue'
import SelectAllCheckbox from './SelectAllCheckbox.vue'
import { useOptimisticTrash } from '@/composables/useOptimisticTrash.js'
import {
  readLayout,
  writeLayout,
  emptyStateFor,
  searchDiagrams,
  sortDiagrams,
  defaultDirection,
  DEFAULT_SORT,
} from '@/components/home/homeViews.js'
import { submitOrThrow } from '@/data/submit.js'
import { createDiagramDocument } from '@/diagram/schema.js'

const emit = defineEmits(['open', 'changed'])

// `refetch: false` keeps writes from triggering their own list reload — every
// mutation here already ends in an explicit refresh(), so the default would
// re-fetch twice per change (and once per diagram during a bulk delete).
const enriched = useList({
  doctype: 'Draw Diagram',
  // `thumbnail` is the saved raster preview shown on tiles. `document` is NOT here:
  // carrying every diagram's full JSON made this response about nine times larger,
  // to serve a live preview that only the diagrams without a raster ever need (#223).
  fields: ['name', 'title', 'creation', 'modified', 'diagram_type', 'owner', 'thumbnail'],
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
// Sort state for the list view's column headers (#541 item 1) — there is no
// standalone sort control any more. Tile view renders in this same order but
// offers no control of its own.
const sortKey = ref(DEFAULT_SORT)
const sortDir = ref('desc')

// A sortable column header: clicking the active column flips direction; a new
// column sorts in its default direction.
function setSort(key) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = defaultDirection(key)
  }
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
const diagrams = computed(() => arrange(visibleRows.value))

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
// The list view's own header/row checkboxes report back as one whole Set
// (frappe-ui's ListView owns that state internally — see DiagramListView).
function applySelection(names) {
  selected.clear()
  names.forEach((name) => selected.add(name))
}

// Tile view's own master checkbox (#404) — list view gets one for free from
// ListHeader, but there is no header row in tile view to carry it.
const allSelected = computed(() => diagrams.value.length > 0 && diagrams.value.every((d) => selected.has(d.name)))
const someSelected = computed(() => selectedCount.value > 0 && !allSelected.value)
function setAllSelected(wanted) {
  clearSelection()
  if (wanted) diagrams.value.forEach((d) => selected.add(d.name))
}

// Nothing on the shelf (a search excluded everything — the truly-empty home
// renders HomeShell's EmptyState instead of this grid).
const nothingHere = computed(() => !diagrams.value.length)
const hasActiveFilter = computed(() => Boolean(query.value.trim()))

// A search that matched nothing wants different words (and glyph) than a fresh,
// unused Home.
const emptyState = computed(() => emptyStateFor(hasActiveFilter.value))

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

// Copy the diagram's editor link to the clipboard (spec I5, "under sharing").
// Both DiagramTile's ⋯ menu and DiagramListView's share this one path, via the
// 'copy-link' event, since it is the only ⋯ action that talks to the clipboard
// rather than to a diagram field — see diagramColumns.js.
function copyLink(diagram) {
  const url = `${window.location.origin}/draw/d/${diagram.name}`
  navigator.clipboard?.writeText(url).then(
    () => toast.success('Link copied'),
    () => toast.error('Could not copy link'),
  )
}

// --- rename / duplicate -----------------------------------------------------
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
  'copy-link': copyLink,
  rename: startRename,
  duplicate,
  delete: trash,
  'show-info': startInfo,
}
</script>

<template>
  <div>
    <!-- Toolbar: a Find bar, or a bulk-action bar when diagrams are selected;
         the view toggle sits at the far right (Create moved to the page header,
         #541 item 5). -->
    <div class="mb-5 flex h-9 items-center gap-2 px-3">
      <!-- List view's master checkbox comes free from ListHeader; tile view has
           no header row, so it sits here instead. -->
      <!-- Spacing lives on the wrapper: frappe-ui's Checkbox has no
           `inheritAttrs: false`, so a class passed to it lands on both its root
           element and the control inside, doubling the margin. -->
      <span v-if="view === 'tile' && diagrams.length" class="mr-1 flex flex-none items-center">
        <SelectAllCheckbox :all-selected="allSelected" :some-selected="someSelected" @change="setAllSelected" />
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
            <!-- frappe-ui-exempt: a Button's own padding would not fit inside the TextInput's suffix slot alongside the field's own icon --><button
              class="flex size-4 items-center justify-center rounded text-ink-gray-5 hover:text-ink-gray-7"
              aria-label="Clear search"
              @click="query = ''"
            >
              <span class="lucide-x size-3.5" aria-hidden="true" />
            </button>
          </template>
        </TextInput>

        <div class="flex-1" />
      </template>

      <!-- Outside both branches: the view toggle is about the page, not about what
           is selected, so it stays put when the bar turns into the bulk bar. -->
      <!-- Two icon cells rather than TabButtons (#497). TabButtons sets a native
           `title` on any option it renders icon-only — and an option carrying
           `icon` IS icon-only — which is the flat grey OS tooltip, drawn wherever
           the pointer is and about a second late. Nothing a consumer passes turns
           it off. Same control the canvas tools use, so both surfaces match. -->
      <TooltipProvider :hover-delay="2" :skip-delay="0">
        <div class="flex gap-1">
          <Tooltip v-for="option in VIEW_OPTIONS" :key="option.value" :text="option.label">
            <!-- frappe-ui-exempt: an icon-only toggle cell — see #497 above; TabButtons' native title tooltip is what this replaces --><button
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
    </div>

    <DiagramListView
      v-if="view === 'list' && diagrams.length"
      :diagrams="diagrams"
      :selected="selected"
      :sort-key="sortKey"
      :sort-dir="sortDir"
      @open="emit('open', $event)"
      @select-all="applySelection"
      @sort="setSort"
      @copy-link="copyLink"
      @rename="startRename"
      @duplicate="duplicate"
      @delete="trash"
      @show-info="startInfo"
    />
    <DiagramCollection v-else-if="diagrams.length" :diagrams="diagrams" :selected="selected" v-on="collectionHandlers" />

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
