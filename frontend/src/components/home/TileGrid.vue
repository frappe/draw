<script setup>
// Home diagram browser (spec §2). A toolbar offers a type filter, a sort, and a
// tile/list view toggle, turning into a bulk-action bar when diagrams are
// selected. Below it the diagrams are grouped: Pinned, Recent (only once there
// are enough), All diagrams (+ the dashed create tile), then folder sections,
// and a quiet end-of-page graphic. CRUD runs through the shared resources.
import { computed, onMounted, reactive, ref } from 'vue'
import { createListResource, FeatherIcon, Dialog, Button, FormControl, Dropdown } from 'frappe-ui'
import DiagramCollection from './DiagramCollection.vue'
import FolderSection from './FolderSection.vue'
import { folders, moveDiagramToFolder } from '@/data/folders.js'
import { createDiagramDocument } from '@/diagram/schema.js'
import { DIAGRAM_TYPES, typeLabel } from '@/data/diagramTypes.js'

const emit = defineEmits(['create', 'open', 'changed'])

const enriched = createListResource({
  doctype: 'Draw Diagram',
  fields: ['name', 'title', 'creation', 'modified', 'folder', 'diagram_type', 'is_pinned', 'document'],
  filters: { is_trashed: 0 },
  orderBy: 'modified desc',
  pageLength: 500,
})

onMounted(() => enriched.fetch())

const rows = computed(() => enriched.data || [])

// --- view / type filter / sort --------------------------------------------
const view = ref('tile')
const typeFilter = ref('all')
const sortKey = ref('modified')

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

const visibleRows = computed(() => rows.value.filter(matchesType))

// Pinned across the whole library; everything else excludes pinned so each
// diagram appears once outside the Pinned section.
const pinned = computed(() => visibleRows.value.filter((d) => d.is_pinned).sort(bySort))
const unpinned = computed(() => visibleRows.value.filter((d) => !d.is_pinned))
const unfiled = computed(() => unpinned.value.filter((d) => !d.folder))

// Recent is a quick-access shortcut that only earns its place once the unfiled
// list is large; it shows the 6 most-recently-edited unfiled diagrams, which are
// then omitted from "All" so nothing is listed twice.
const RECENT_THRESHOLD = 8
const RECENT_COUNT = 6
const showRecent = computed(() => unfiled.value.length > RECENT_THRESHOLD)
const recent = computed(() =>
  showRecent.value ? [...unfiled.value].sort(byNewest).slice(0, RECENT_COUNT) : [],
)
const allList = computed(() => {
  const recentNames = new Set(recent.value.map((d) => d.name))
  return unfiled.value.filter((d) => !recentNames.has(d.name)).sort(bySort)
})

const byFolder = computed(() =>
  (folders.data || []).map((folder) => ({
    folder,
    diagrams: unpinned.value.filter((d) => d.folder === folder.name).sort(bySort),
  })),
)

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
  await enriched.insert.submit({
    title: `${diagram.title} copy`,
    folder: diagram.folder || null,
    document,
  })
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
</script>

<template>
  <div>
    <!-- Toolbar: bulk actions when something is selected, else filter + sort. -->
    <div class="mb-5 flex h-9 items-center gap-2">
      <template v-if="selectedCount">
        <span class="text-[13px] font-semibold text-ink-gray-9">{{ selectedCount }} selected</span>
        <Button variant="subtle" theme="red" @click="deleteSelected">
          <template #prefix><FeatherIcon name="trash-2" class="h-4 w-4" /></template>
          Delete
        </Button>
        <Button variant="ghost" @click="clearSelection">Clear</Button>
      </template>

      <template v-else>
        <Dropdown :options="typeOptions" placement="bottom-start">
          <Button variant="subtle">
            <template #prefix><FeatherIcon name="filter" class="h-4 w-4" /></template>
            {{ typeFilterLabel }}
            <template #suffix><FeatherIcon name="chevron-down" class="h-4 w-4" /></template>
          </Button>
        </Dropdown>
        <Dropdown :options="sortOptions" placement="bottom-start">
          <Button variant="subtle">
            <template #prefix><FeatherIcon name="bar-chart-2" class="h-4 w-4 rotate-90" /></template>
            {{ sortLabel }}
            <template #suffix><FeatherIcon name="chevron-down" class="h-4 w-4" /></template>
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
          <FeatherIcon :name="option.icon" class="h-4 w-4" />
        </button>
      </div>
    </div>

    <!-- Pinned -->
    <section v-if="pinned.length" class="mb-8">
      <h2 class="mb-3 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-ink-gray-5">
        <FeatherIcon name="bookmark" class="h-3.5 w-3.5" /> Pinned
      </h2>
      <DiagramCollection
        :diagrams="pinned" :view="view" :selected="selected"
        @open="emit('open', $event)" @toggle-select="toggleSelect" @toggle-pin="togglePin"
        @rename="startRename" @duplicate="duplicate" @delete="trash"
      />
    </section>

    <!-- Recent -->
    <section v-if="recent.length" class="mb-8">
      <h2 class="mb-3 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-ink-gray-5">
        <FeatherIcon name="clock" class="h-3.5 w-3.5" /> Recent
      </h2>
      <DiagramCollection
        :diagrams="recent" :view="view" :selected="selected"
        @open="emit('open', $event)" @toggle-select="toggleSelect" @toggle-pin="togglePin"
        @rename="startRename" @duplicate="duplicate" @delete="trash"
      />
    </section>

    <!-- All diagrams (+ create affordance at the end) -->
    <section>
      <h2 v-if="pinned.length || recent.length" class="mb-3 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-ink-gray-5">
        <FeatherIcon name="grid" class="h-3.5 w-3.5" /> All diagrams
      </h2>
      <DiagramCollection
        :diagrams="allList" :view="view" :selected="selected"
        @open="emit('open', $event)" @toggle-select="toggleSelect" @toggle-pin="togglePin"
        @rename="startRename" @duplicate="duplicate" @delete="trash"
      >
        <template #append>
          <button
            v-if="view === 'tile'"
            class="flex h-[166px] flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-outline-gray-3 text-ink-gray-7 hover:bg-surface-gray-1"
            @click="emit('create')"
          >
            <div class="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-surface-gray-2">
              <FeatherIcon name="plus" class="h-5 w-5" />
            </div>
            <span class="text-[13px] font-semibold">New diagram</span>
          </button>
          <button
            v-else
            class="flex items-center justify-center gap-2 rounded-lg border-[1.5px] border-dashed border-outline-gray-3 py-3 text-[13px] font-semibold text-ink-gray-7 hover:bg-surface-gray-1"
            @click="emit('create')"
          >
            <FeatherIcon name="plus" class="h-4 w-4" /> New diagram
          </button>
        </template>
      </DiagramCollection>
    </section>

    <FolderSection
      v-for="group in byFolder"
      :key="group.folder.name"
      :folder="group.folder"
      :diagrams="group.diagrams"
      :view="view"
      :selected="selected"
      @open="emit('open', $event)"
      @toggle-select="toggleSelect"
      @toggle-pin="togglePin"
      @rename="startRename"
      @duplicate="duplicate"
      @delete="trash"
      @drop-diagram="dropOnFolder(group.folder.name, $event)"
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
  </div>
</template>
