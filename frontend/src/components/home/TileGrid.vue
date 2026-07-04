<script setup>
// Home diagram browser (spec §2). Modes chosen from the sidebar:
//   home   — a file-explorer: Pinned (root only) + loose files + folder tiles;
//            opening a folder drills in (HomeShell tracks the path + breadcrumb)
//   recent — a flat list of the most-recently-edited diagrams
//   all    — a flat list of every diagram
// Toolbar offers a type filter, sort, and tile/list toggle, becoming a bulk-
// action bar on selection. Creation is the top-right CTA only (no inline tile).
// At most MAX_PINNED diagrams can be pinned.
import { computed, onMounted, reactive, ref, watchEffect } from 'vue'
import { createListResource, Dialog, Button, FormControl, Dropdown, TextInput, Tooltip } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import DiagramCollection from './DiagramCollection.vue'
import FolderItem from './FolderItem.vue'
import { folders, moveDiagramToFolder, deleteFolder } from '@/data/folders.js'
import { createDiagramDocument } from '@/diagram/schema.js'
import { DIAGRAM_TYPES, typeLabel } from '@/data/diagramTypes.js'

const props = defineProps({
  mode: { type: String, default: 'home' }, // 'home' | 'recent' | 'all'
  folder: { type: Object, default: null }, // the open folder when drilled in (home)
})
const emit = defineEmits(['create', 'open', 'open-folder', 'changed'])

const MAX_PINNED = 5
const RECENT_LIMIT = 24

const enriched = createListResource({
  doctype: 'Draw Diagram',
  fields: ['name', 'title', 'creation', 'modified', 'folder', 'diagram_type', 'is_pinned', 'owner', 'document'],
  filters: { is_trashed: 0 },
  orderBy: 'modified desc',
  pageLength: 500,
})

onMounted(() => enriched.fetch())

const rows = computed(() => enriched.data || [])
const pinnedTotal = computed(() => rows.value.filter((d) => d.is_pinned).length)
const pinLimitReached = computed(() => pinnedTotal.value >= MAX_PINNED)

// --- view / search / type filter / sort -----------------------------------
const view = ref('list')
const query = ref('')
const typeFilter = ref('all')
const sortKey = ref('modified')

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
const sortOptions = computed(() => SORTS.map((s) => ({ label: s.label, onClick: () => (sortKey.value = s.key) })))

const typeOptions = computed(() => [
  { label: 'All types', onClick: () => (typeFilter.value = 'all') },
  ...DIAGRAM_TYPES.map((t) => ({ label: t.label, icon: t.icon, onClick: () => (typeFilter.value = t.value) })),
])
const typeFilterLabel = computed(() => (typeFilter.value === 'all' ? 'All types' : typeLabel(typeFilter.value)))

function ts(value) {
  return value ? new Date(value.replace(' ', 'T')).getTime() : 0
}
function bySort(a, b) {
  if (sortKey.value === 'title') return (a.title || '').localeCompare(b.title || '')
  // Smart: surface what you'd likely want next — pinned first, then most recently
  // edited. (Without open-frequency data this is the best local heuristic; I6.)
  if (sortKey.value === 'smart') {
    const pin = (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0)
    return pin || ts(b.modified) - ts(a.modified)
  }
  return ts(b[sortKey.value]) - ts(a[sortKey.value])
}
function byNewest(a, b) {
  return ts(b.modified) - ts(a.modified)
}
function matchesType(diagram) {
  return typeFilter.value === 'all' || (diagram.diagram_type || 'block') === typeFilter.value
}

const visibleRows = computed(() => rows.value.filter((d) => matchesType(d) && matchesQuery(d)))

// Home root: pinned group + loose files + folder tiles. Inside a folder: that
// folder's files. Pinned items show only in the Pinned group.
const pinned = computed(() => visibleRows.value.filter((d) => d.is_pinned).sort(bySort))

// Files shown depend on location: a folder's own diagrams, else the unfiled,
// non-pinned diagrams at the root.
const files = computed(() =>
  props.folder
    ? visibleRows.value.filter((d) => d.folder === props.folder.name).sort(bySort)
    : visibleRows.value.filter((d) => !d.is_pinned && !d.folder).sort(bySort),
)

// Sub-folders of the current location (top-level when at the root).
const parentFolderName = computed(() => props.folder?.name || null)
function folderItemCount(folderName) {
  const subs = (folders.data || []).filter((f) => f.parent_folder === folderName).length
  return subs + rows.value.filter((d) => d.folder === folderName).length
}
const folderTiles = computed(() =>
  (folders.data || [])
    .filter((f) => (f.parent_folder || null) === parentFolderName.value)
    .map((folder) => ({ folder, count: folderItemCount(folder.name) })),
)

// Recent + All are flat across the whole (filtered) library.
const recentList = computed(() => [...visibleRows.value].sort(byNewest).slice(0, RECENT_LIMIT))
const allFlat = computed(() => [...visibleRows.value].sort(bySort))

// --- selection + bulk delete ----------------------------------------------
// Diagrams and folders select in parallel sets (they delete via different paths:
// diagrams trash, folders delete). The bulk bar + Delete act on both (H2).
const selected = reactive(new Set())
const selectedFolders = reactive(new Set())
const selectedCount = computed(() => selected.size + selectedFolders.size)
function toggleSelect(name) {
  if (selected.has(name)) selected.delete(name)
  else selected.add(name)
}
function toggleSelectFolder(name) {
  if (selectedFolders.has(name)) selectedFolders.delete(name)
  else selectedFolders.add(name)
}
function clearSelection() {
  selected.clear()
  selectedFolders.clear()
}

// The diagrams selectable in the current view (folders excluded), so Select all
// grabs exactly what's on screen.
const currentDiagrams = computed(() => {
  if (props.mode === 'recent') return recentList.value
  if (props.mode === 'all') return allFlat.value
  return [...pinned.value, ...files.value]
})
// Current view shows nothing (a search/type filter excluded everything — the
// truly-empty home renders HomeShell's EmptyState instead of this grid).
const nothingHere = computed(() => {
  if (props.mode === 'home') return !pinned.value.length && !files.value.length && !folderTiles.value.length
  return !currentDiagrams.value.length
})
const hasActiveFilter = computed(() => Boolean(query.value.trim()) || typeFilter.value !== 'all')
const allSelected = computed(
  () => currentDiagrams.value.length > 0 && currentDiagrams.value.every((d) => selected.has(d.name)),
)
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

const confirmDelete = reactive({ open: false, names: [], folders: [] })
function askDelete(names, folderNames = []) {
  confirmDelete.names = names
  confirmDelete.folders = folderNames
  confirmDelete.open = true
}
const confirmMessage = computed(() => {
  const n = confirmDelete.names.length
  const f = confirmDelete.folders.length
  const parts = []
  if (n) parts.push(`move ${n} diagram${n === 1 ? '' : 's'} to Trash`)
  if (f) parts.push(`delete ${f} folder${f === 1 ? '' : 's'}`)
  const tail = f ? ' Folders are removed; the diagrams inside keep their data.' : ` You can restore ${n === 1 ? 'it' : 'them'} from Trash.`
  return `${parts.join(' and ').replace(/^./, (c) => c.toUpperCase())}?${tail}`
})
async function performDelete() {
  for (const name of confirmDelete.names) {
    await enriched.setValue.submit({ name, is_trashed: 1, trashed_on: frappeNow() })
  }
  for (const folderName of confirmDelete.folders) {
    await deleteFolder(folderName)
  }
  confirmDelete.open = false
  confirmDelete.names = []
  confirmDelete.folders = []
  clearSelection()
  refresh()
}
function deleteSelected() {
  askDelete([...selected], [...selectedFolders])
}
function trash(diagram) {
  askDelete([diagram.name])
}

// --- pin / rename / duplicate ---------------------------------------------
async function togglePin(diagram) {
  if (!diagram.is_pinned && pinLimitReached.value) return
  await enriched.setValue.submit({ name: diagram.name, is_pinned: diagram.is_pinned ? 0 : 1 })
  refresh()
}

const editor = reactive({ open: false, value: '', name: null })
function startRename(diagram) {
  Object.assign(editor, { open: true, value: diagram.title, name: diagram.name })
}
async function saveEditor() {
  await enriched.setValue.submit({ name: editor.name, title: editor.value })
  editor.open = false
  refresh()
}

async function duplicate(diagram) {
  const document = diagram.document || createDiagramDocument()
  await enriched.insert.submit({ title: `${diagram.title} copy`, folder: diagram.folder || null, document })
  refresh()
}

async function dropOnFolder(folderName, diagramName) {
  await moveDiagramToFolder(enriched, diagramName, folderName)
  refresh()
}

// --- move to folder (I5) ---------------------------------------------------
const moveTarget = reactive({ open: false, diagram: null })
function startMove(diagram) {
  Object.assign(moveTarget, { open: true, diagram })
}
// Destinations: every folder + a "Home" (root) option; the current folder is
// marked so it's clear where the diagram already lives.
const moveDestinations = computed(() => [
  { name: null, label: 'Home (no folder)' },
  ...(folders.data || []).map((f) => ({ name: f.name, label: f.folder_name || f.name })),
])
async function moveTo(folderName) {
  if (moveTarget.diagram) await moveDiagramToFolder(enriched, moveTarget.diagram.name, folderName)
  moveTarget.open = false
  moveTarget.diagram = null
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
  const folderName = (folders.data || []).find((f) => f.name === d.folder)?.folder_name
  return [
    ['Name', d.title],
    ['Type', typeLabel(d.diagram_type)],
    ['Owner', d.owner || '—'],
    ['Location', folderName || 'Home'],
    ['Created', d.creation ? d.creation.slice(0, 16).replace(' ', ' · ') : '—'],
    ['Last edited', d.modified ? d.modified.slice(0, 16).replace(' ', ' · ') : '—'],
  ]
})

function refresh() {
  enriched.reload()
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
  move: startMove,
  'show-info': startInfo,
}
const TILE_COLS = 'grid-template-columns: repeat(auto-fill, minmax(224px, 1fr))'
</script>

<template>
  <div>
    <!-- Toolbar: a Find bar + filter/sort/new-folder, or a bulk-action bar when
         diagrams are selected; the view toggle sits at the far right. -->
    <div class="mb-5 flex h-9 items-center gap-2">
      <!-- Gmail-style master checkbox: select all / clear, with an indeterminate
           dash when only some are selected. Always at the top-left of the list. -->
      <Tooltip :text="allSelected || someSelected ? 'Clear selection' : 'Select all'">
        <input
          v-if="currentDiagrams.length"
          ref="masterCheckbox"
          type="checkbox"
          :checked="allSelected"
          class="ml-1 mr-1 h-4 w-4 flex-none cursor-pointer accent-[#171717]"
          :aria-label="allSelected || someSelected ? 'Clear selection' : 'Select all'"
          @change="toggleSelectAll"
        />
      </Tooltip>

      <template v-if="selectedCount">
        <span class="text-[13px] font-semibold text-ink-gray-9">{{ selectedCount }} selected</span>
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
        <Dropdown :options="typeOptions" placement="bottom-start">
          <Button variant="subtle">
            <template #prefix><LucideIcon name="filter" class="h-4 w-4" /></template>
            {{ typeFilterLabel }}
          </Button>
        </Dropdown>
        <Dropdown :options="sortOptions" placement="bottom-start">
          <Button variant="subtle">
            <template #prefix><LucideIcon name="bar-chart-2" class="h-4 w-4 rotate-90" /></template>
            {{ sortLabel }}
          </Button>
        </Dropdown>
      </template>

      <div class="ml-auto flex items-center rounded-md border border-outline-gray-2 p-0.5">
        <button
          v-for="option in [{ key: 'tile', icon: 'grid' }, { key: 'list', icon: 'list' }]"
          :key="option.key"
          class="flex h-7 w-7 items-center justify-center rounded"
          :class="view === option.key ? 'bg-surface-gray-3 text-ink-gray-9' : 'text-ink-gray-5 hover:bg-surface-gray-2'"
          @click="view = option.key"
        >
          <LucideIcon :name="option.icon" class="h-4 w-4" />
        </button>
      </div>
    </div>

    <!-- List-view column header (mirrors the row columns). -->
    <div
      v-if="view === 'list'"
      class="mb-2 flex items-center gap-3 px-3 text-[11px] font-medium uppercase tracking-wide text-ink-gray-5"
    >
      <span class="w-[18px] flex-none" />
      <span class="h-8 w-8 flex-none" />
      <span class="min-w-0 flex-1">Name</span>
      <span class="hidden w-28 flex-none lg:inline">Owner</span>
      <span class="hidden w-28 flex-none md:inline">Created</span>
      <span class="hidden w-28 flex-none sm:inline">Last edited</span>
      <span class="w-7 flex-none" />
    </div>

    <!-- HOME: a file explorer — Pinned (root only) + files + sub/folders. -->
    <template v-if="mode === 'home'">
      <!-- Home order (K1): Pinned (root only) → Folders → loose diagrams, so a
           new diagram never sorts above the folders. A section shows its header
           only when another section precedes it, so a lone list stays header-less
           (J1 two-section behaviour falls out of this). -->
      <section v-if="!folder && pinned.length" class="mb-6">
        <h2 class="mb-3 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-ink-gray-5">
          <LucideIcon name="pin" class="h-3.5 w-3.5" /> Pinned
        </h2>
        <DiagramCollection :diagrams="pinned" :view="view" :selected="selected" :pin-limit-reached="pinLimitReached" v-on="collectionHandlers" />
      </section>

      <section v-if="folderTiles.length" class="mb-6">
        <h2 class="mb-3 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-ink-gray-5">
          <LucideIcon name="folder" class="h-3.5 w-3.5" /> Folders
        </h2>
        <div v-if="view === 'tile'" class="grid gap-[18px]" :style="TILE_COLS">
          <FolderItem
            v-for="group in folderTiles"
            :key="group.folder.name"
            :folder="group.folder"
            :count="group.count"
            :selected="selectedFolders.has(group.folder.name)"
            view="tile"
            @open="emit('open-folder', group.folder)"
            @toggle-select="toggleSelectFolder"
            @drop-diagram="dropOnFolder(group.folder.name, $event)"
          />
        </div>
        <div v-else class="flex flex-col gap-1.5">
          <FolderItem
            v-for="group in folderTiles"
            :key="group.folder.name"
            :folder="group.folder"
            :count="group.count"
            :selected="selectedFolders.has(group.folder.name)"
            view="list"
            @open="emit('open-folder', group.folder)"
            @toggle-select="toggleSelectFolder"
            @drop-diagram="dropOnFolder(group.folder.name, $event)"
          />
        </div>
      </section>

      <section v-if="files.length">
        <h2 v-if="(!folder && pinned.length) || folderTiles.length" class="mb-3 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-ink-gray-5">
          <LucideIcon name="layers" class="h-3.5 w-3.5" /> {{ folder ? 'Diagrams' : 'Other diagrams' }}
        </h2>
        <DiagramCollection :diagrams="files" :view="view" :selected="selected" :pin-limit-reached="pinLimitReached" v-on="collectionHandlers" />
      </section>

      <p v-if="folder && !files.length && !folderTiles.length" class="py-10 text-center text-[13px] text-ink-gray-5">
        This folder is empty.
      </p>
    </template>

    <!-- Nothing matches the current search / type filter. -->
    <div v-if="nothingHere && (mode !== 'home' || !folder)" class="flex flex-col items-center gap-3 py-20 text-center">
      <div class="flex h-12 w-12 items-center justify-center rounded-full bg-surface-gray-2">
        <LucideIcon :name="hasActiveFilter ? 'search' : 'feather'" class="h-5 w-5 text-ink-gray-5" />
      </div>
      <div>
        <p class="text-[14px] font-semibold text-ink-gray-8">
          {{ hasActiveFilter ? 'No diagrams match' : 'Nothing here yet' }}
        </p>
        <p class="mt-0.5 text-[12px] text-ink-gray-5">
          {{ hasActiveFilter ? 'Try a different search or filter.' : 'Create a diagram to get started.' }}
        </p>
      </div>
    </div>

    <!-- RECENT / ALL: a single flat list. (Only these modes — home renders its
         own explorer above; v-else-if keeps it from double-rendering there.) -->
    <DiagramCollection
      v-else-if="mode !== 'home'"
      :diagrams="mode === 'recent' ? recentList : allFlat"
      :view="view"
      :selected="selected"
      :pin-limit-reached="pinLimitReached"
      v-on="collectionHandlers"
    />

    <!-- Quiet end-of-page marker (only when the view actually has content). -->
    <div v-if="!nothingHere" class="mt-16 flex flex-col items-center gap-2 py-10 text-center">
      <LucideIcon name="feather" class="h-6 w-6 text-ink-gray-3" />
      <p class="text-[12px] text-ink-gray-4">You've reached the end · made with Frappe Draw</p>
    </div>

    <Dialog v-model="confirmDelete.open" :options="{ title: 'Move to Trash?' }">
      <template #body-content>
        <p class="text-base text-ink-gray-7">{{ confirmMessage }}</p>
      </template>
      <template #actions>
        <Button variant="solid" theme="red" @click="performDelete">Delete</Button>
        <Button variant="subtle" @click="confirmDelete.open = false">Cancel</Button>
      </template>
    </Dialog>

    <Dialog v-model="editor.open" :options="{ title: 'Rename diagram' }">
      <template #body-content>
        <FormControl type="text" label="Title" v-model="editor.value" />
      </template>
      <template #actions>
        <Button variant="solid" @click="saveEditor">Save</Button>
      </template>
    </Dialog>

    <!-- Move to folder (I5). -->
    <Dialog v-model="moveTarget.open" :options="{ title: 'Move to…' }">
      <template #body-content>
        <div class="flex flex-col gap-1">
          <button
            v-for="dest in moveDestinations"
            :key="dest.name || 'root'"
            class="flex items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] hover:bg-surface-gray-2"
            :class="(moveTarget.diagram?.folder || null) === dest.name ? 'text-ink-gray-5' : 'text-ink-gray-8'"
            :disabled="(moveTarget.diagram?.folder || null) === dest.name"
            @click="moveTo(dest.name)"
          >
            <LucideIcon :name="dest.name ? 'folder' : 'house'" class="h-4 w-4 text-ink-gray-6" />
            {{ dest.label }}
            <span v-if="(moveTarget.diagram?.folder || null) === dest.name" class="ml-auto text-[11px]">Current</span>
          </button>
        </div>
      </template>
    </Dialog>

    <!-- Show info (I5): read-only metadata. -->
    <Dialog v-model="info.open" :options="{ title: 'Diagram info' }">
      <template #body-content>
        <dl class="grid grid-cols-[92px_1fr] gap-x-3 gap-y-2 text-[13px]">
          <template v-for="[label, value] in infoRows" :key="label">
            <dt class="text-ink-gray-5">{{ label }}</dt>
            <dd class="truncate text-ink-gray-8">{{ value }}</dd>
          </template>
        </dl>
      </template>
    </Dialog>

  </div>
</template>
