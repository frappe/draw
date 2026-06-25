<script setup>
// Home diagram browser (spec §2). Modes chosen from the sidebar:
//   home   — a file-explorer: Pinned (root only) + loose files + folder tiles;
//            opening a folder drills in (HomeShell tracks the path + breadcrumb)
//   recent — a flat list of the most-recently-edited diagrams
//   all    — a flat list of every diagram
// Toolbar offers a type filter, sort, and tile/list toggle, becoming a bulk-
// action bar on selection. Creation is the top-right CTA only (no inline tile).
// At most MAX_PINNED diagrams can be pinned.
import { computed, onMounted, reactive, ref } from 'vue'
import { createListResource, FeatherIcon, Dialog, Button, FormControl, Dropdown, TextInput } from 'frappe-ui'
import DiagramCollection from './DiagramCollection.vue'
import FolderItem from './FolderItem.vue'
import { folders, moveDiagramToFolder, createFolder } from '@/data/folders.js'
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
  fields: ['name', 'title', 'creation', 'modified', 'folder', 'diagram_type', 'is_pinned', 'document'],
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
const selected = reactive(new Set())
const selectedCount = computed(() => selected.size)
function toggleSelect(name) {
  if (selected.has(name)) selected.delete(name)
  else selected.add(name)
}
function clearSelection() {
  selected.clear()
}

const confirmDelete = reactive({ open: false, names: [] })
function askDelete(names) {
  confirmDelete.names = names
  confirmDelete.open = true
}
const confirmMessage = computed(() => {
  const n = confirmDelete.names.length
  return `Move ${n} diagram${n === 1 ? '' : 's'} to Trash? You can restore ${n === 1 ? 'it' : 'them'} from Trash.`
})
async function performDelete() {
  for (const name of confirmDelete.names) {
    await enriched.setValue.submit({ name, is_trashed: 1, trashed_on: frappeNow() })
  }
  confirmDelete.open = false
  confirmDelete.names = []
  clearSelection()
  refresh()
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
  await enriched.setValue.submit({ name: diagram.name, is_pinned: diagram.is_pinned ? 0 : 1 })
  refresh()
}

// New folder, created in the current location (nested under the open folder).
const newFolder = reactive({ open: false, value: '' })
function openNewFolder() {
  newFolder.value = ''
  newFolder.open = true
}
async function saveNewFolder() {
  const name = newFolder.value.trim()
  if (name) await createFolder(name, parentFolderName.value)
  newFolder.open = false
  emit('changed')
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
}
const TILE_COLS = 'grid-template-columns: repeat(auto-fill, minmax(224px, 1fr))'
</script>

<template>
  <div>
    <!-- Toolbar: a Find bar + filter/sort/new-folder, or a bulk-action bar when
         diagrams are selected; the view toggle sits at the far right. -->
    <div class="mb-5 flex h-9 items-center gap-2">
      <template v-if="selectedCount">
        <span class="text-[13px] font-semibold text-ink-gray-9">{{ selectedCount }} selected</span>
        <Button variant="subtle" theme="red" @click="deleteSelected">
          <template #prefix><FeatherIcon name="trash-2" class="h-4 w-4" /></template>
          Delete
        </Button>
        <Button variant="ghost" @click="clearSelection">Clear</Button>
        <div class="flex-1" />
      </template>

      <template v-else>
        <TextInput v-model="query" type="text" placeholder="Find a diagram" class="max-w-md flex-1">
          <template #prefix><FeatherIcon name="search" class="h-3.5 w-3.5 text-ink-gray-5" /></template>
        </TextInput>
        <Dropdown :options="typeOptions" placement="bottom-start">
          <Button variant="subtle">
            <template #prefix><FeatherIcon name="filter" class="h-4 w-4" /></template>
            {{ typeFilterLabel }}
          </Button>
        </Dropdown>
        <Dropdown :options="sortOptions" placement="bottom-start">
          <Button variant="subtle">
            <template #prefix><FeatherIcon name="bar-chart-2" class="h-4 w-4 rotate-90" /></template>
            {{ sortLabel }}
          </Button>
        </Dropdown>
        <Button v-if="mode === 'home'" variant="subtle" @click="openNewFolder">
          <template #prefix><FeatherIcon name="folder-plus" class="h-4 w-4" /></template>
          New folder
        </Button>
      </template>

      <div class="ml-auto flex items-center rounded-md border border-outline-gray-2 p-0.5">
        <button
          v-for="option in [{ key: 'tile', icon: 'grid' }, { key: 'list', icon: 'list' }]"
          :key="option.key"
          class="flex h-7 w-7 items-center justify-center rounded"
          :class="view === option.key ? 'bg-surface-gray-3 text-ink-gray-9' : 'text-ink-gray-5 hover:bg-surface-gray-2'"
          @click="view = option.key"
        >
          <FeatherIcon :name="option.icon" class="h-4 w-4" />
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
      <span class="hidden w-28 flex-none md:inline">Created</span>
      <span class="hidden w-28 flex-none sm:inline">Last edited</span>
      <span class="w-7 flex-none" />
    </div>

    <!-- HOME: a file explorer — Pinned (root only) + files + sub/folders. -->
    <template v-if="mode === 'home'">
      <section v-if="!folder && pinned.length" class="mb-8">
        <h2 class="mb-3 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-ink-gray-5">
          <FeatherIcon name="bookmark" class="h-3.5 w-3.5" /> Pinned
        </h2>
        <DiagramCollection :diagrams="pinned" :view="view" :selected="selected" :pin-limit-reached="pinLimitReached" v-on="collectionHandlers" />
      </section>

      <DiagramCollection v-if="files.length" :diagrams="files" :view="view" :selected="selected" :pin-limit-reached="pinLimitReached" v-on="collectionHandlers" />

      <section v-if="folderTiles.length" class="mt-8">
        <h2 class="mb-3 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-ink-gray-5">
          <FeatherIcon name="folder" class="h-3.5 w-3.5" /> Folders
        </h2>
        <div v-if="view === 'tile'" class="grid gap-[18px]" :style="TILE_COLS">
          <FolderItem
            v-for="group in folderTiles"
            :key="group.folder.name"
            :folder="group.folder"
            :count="group.count"
            view="tile"
            @open="emit('open-folder', group.folder)"
            @drop-diagram="dropOnFolder(group.folder.name, $event)"
          />
        </div>
        <div v-else class="flex flex-col gap-1.5">
          <FolderItem
            v-for="group in folderTiles"
            :key="group.folder.name"
            :folder="group.folder"
            :count="group.count"
            view="list"
            @open="emit('open-folder', group.folder)"
            @drop-diagram="dropOnFolder(group.folder.name, $event)"
          />
        </div>
      </section>

      <p v-if="folder && !files.length && !folderTiles.length" class="py-10 text-center text-[13px] text-ink-gray-5">
        This folder is empty.
      </p>
    </template>

    <!-- RECENT / ALL: a single flat list. -->
    <DiagramCollection
      v-else
      :diagrams="mode === 'recent' ? recentList : allFlat"
      :view="view"
      :selected="selected"
      :pin-limit-reached="pinLimitReached"
      v-on="collectionHandlers"
    />

    <!-- Quiet end-of-page marker. -->
    <div class="mt-16 flex flex-col items-center gap-2 py-10 text-center">
      <FeatherIcon name="feather" class="h-6 w-6 text-ink-gray-3" />
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

    <Dialog v-model="newFolder.open" :options="{ title: folder ? `New folder in ${folder.folder_name || folder.name}` : 'New folder' }">
      <template #body-content>
        <FormControl type="text" label="Folder name" v-model="newFolder.value" @keydown.enter="saveNewFolder" />
      </template>
      <template #actions>
        <Button variant="solid" @click="saveNewFolder">Create folder</Button>
      </template>
    </Dialog>
  </div>
</template>
