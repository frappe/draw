<script setup>
// Home diagram browser (spec §2). A toolbar offers a type filter + tile/list
// view toggle, and turns into a bulk-action bar when diagrams are selected.
// Below it: the unfiled diagrams in the chosen view, the folder sections, then
// the dashed "New diagram" affordance at the end. CRUD + drag-into-folder run
// through the shared Draw Diagram resources.
import { computed, onMounted, reactive, ref } from 'vue'
import { createListResource, FeatherIcon, Dialog, Button, FormControl, Dropdown } from 'frappe-ui'
import DiagramTile from './DiagramTile.vue'
import FolderSection from './FolderSection.vue'
import { folders, moveDiagramToFolder } from '@/data/folders.js'
import { createDiagramDocument } from '@/diagram/schema.js'
import { DIAGRAM_TYPES, typeLabel } from '@/data/diagramTypes.js'

const props = defineProps({
  diagrams: { type: Array, default: () => [] },
})
const emit = defineEmits(['create', 'open', 'changed'])

// Enriched list (adds document/folder/type) so tiles render previews, group
// into folders, and filter by type without changing the home list resource.
const enriched = createListResource({
  doctype: 'Draw Diagram',
  fields: ['name', 'title', 'description', 'modified', 'folder', 'diagram_type', 'document'],
  filters: { is_trashed: 0 },
  orderBy: 'sort_order asc, modified desc',
  pageLength: 500,
})

onMounted(() => enriched.fetch())

const rows = computed(() => enriched.data || props.diagrams)

// --- view + type filter ----------------------------------------------------
const view = ref('tile') // 'tile' | 'list'
const typeFilter = ref('all')

const typeOptions = computed(() => [
  { label: 'All types', onClick: () => (typeFilter.value = 'all') },
  ...DIAGRAM_TYPES.map((type) => ({ label: type.label, icon: type.icon, onClick: () => (typeFilter.value = type.value) })),
])
const typeFilterLabel = computed(() => (typeFilter.value === 'all' ? 'All types' : typeLabel(typeFilter.value)))

function matchesType(diagram) {
  return typeFilter.value === 'all' || (diagram.diagram_type || 'block') === typeFilter.value
}

const visibleRows = computed(() => rows.value.filter(matchesType))
const unfiled = computed(() => visibleRows.value.filter((diagram) => !diagram.folder))
const byFolder = computed(() =>
  (folders.data || []).map((folder) => ({
    folder,
    diagrams: visibleRows.value.filter((diagram) => diagram.folder === folder.name),
  })),
)

// --- selection + bulk actions ---------------------------------------------
const selected = reactive(new Set())
const selectedCount = computed(() => selected.size)

function toggleSelect(name) {
  if (selected.has(name)) selected.delete(name)
  else selected.add(name)
}

function clearSelection() {
  selected.clear()
}

// Deletes (single + bulk) route through a confirmation dialog before moving the
// chosen diagrams to Trash.
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

// --- single-item CRUD (⋯ menu) --------------------------------------------
const editor = reactive({ open: false, field: 'title', label: '', value: '', name: null })

function startRename(diagram) {
  Object.assign(editor, { open: true, field: 'title', label: 'Title', value: diagram.title, name: diagram.name })
}

function startDescription(diagram) {
  Object.assign(editor, { open: true, field: 'description', label: 'Description', value: diagram.description || '', name: diagram.name })
}

async function saveEditor() {
  await enriched.setValue.submit({ name: editor.name, [editor.field]: editor.value })
  editor.open = false
  refresh()
}

async function duplicate(diagram) {
  const document = diagram.document || createDiagramDocument()
  await enriched.insert.submit({
    title: `${diagram.title} copy`,
    description: diagram.description || '',
    folder: diagram.folder || null,
    document,
  })
  refresh()
}

function trash(diagram) {
  askDelete([diagram.name])
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

const TILE_GRID = 'grid gap-[18px]'
const TILE_COLS = 'grid-template-columns: repeat(auto-fill, minmax(224px, 1fr))'
</script>

<template>
  <div>
    <!-- Toolbar: bulk actions when something is selected, else filter + view. -->
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

    <!-- Unfiled diagrams (tile or list), then the create affordance at the end. -->
    <div v-if="view === 'tile'" :class="TILE_GRID" :style="TILE_COLS">
      <DiagramTile
        v-for="diagram in unfiled"
        :key="diagram.name"
        :diagram="diagram"
        :selected="selected.has(diagram.name)"
        :selection-active="selectedCount > 0"
        @open="emit('open', $event)"
        @toggle-select="toggleSelect"
        @rename="startRename"
        @edit-description="startDescription"
        @duplicate="duplicate"
        @delete="trash"
      />
      <button
        class="flex h-[166px] flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-outline-gray-3 text-ink-gray-7 hover:bg-surface-gray-1"
        @click="emit('create')"
      >
        <div class="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-surface-gray-2">
          <FeatherIcon name="plus" class="h-5 w-5" />
        </div>
        <span class="text-[13px] font-semibold">New diagram</span>
      </button>
    </div>

    <div v-else class="flex flex-col gap-1.5">
      <DiagramTile
        v-for="diagram in unfiled"
        :key="diagram.name"
        :diagram="diagram"
        view="list"
        :selected="selected.has(diagram.name)"
        :selection-active="selectedCount > 0"
        @open="emit('open', $event)"
        @toggle-select="toggleSelect"
        @rename="startRename"
        @edit-description="startDescription"
        @duplicate="duplicate"
        @delete="trash"
      />
      <button
        class="flex items-center justify-center gap-2 rounded-lg border-[1.5px] border-dashed border-outline-gray-3 py-3 text-[13px] font-semibold text-ink-gray-7 hover:bg-surface-gray-1"
        @click="emit('create')"
      >
        <FeatherIcon name="plus" class="h-4 w-4" />
        New diagram
      </button>
    </div>

    <FolderSection
      v-for="group in byFolder"
      :key="group.folder.name"
      :folder="group.folder"
      :diagrams="group.diagrams"
      :view="view"
      :selected="selected"
      @open="emit('open', $event)"
      @toggle-select="toggleSelect"
      @rename="startRename"
      @edit-description="startDescription"
      @duplicate="duplicate"
      @delete="trash"
      @drop-diagram="dropOnFolder(group.folder.name, $event)"
    />

    <Dialog v-model="confirmDelete.open" :options="{ title: 'Move to Trash?' }">
      <template #body-content>
        <p class="text-base text-ink-gray-7">{{ confirmMessage }}</p>
      </template>
      <template #actions>
        <Button variant="solid" theme="red" @click="performDelete">Delete</Button>
        <Button variant="subtle" @click="confirmDelete.open = false">Cancel</Button>
      </template>
    </Dialog>

    <Dialog v-model="editor.open" :options="{ title: `Edit ${editor.label.toLowerCase()}` }">
      <template #body-content>
        <FormControl
          :type="editor.field === 'description' ? 'textarea' : 'text'"
          :label="editor.label"
          v-model="editor.value"
        />
      </template>
      <template #actions>
        <Button variant="solid" @click="saveEditor">Save</Button>
      </template>
    </Dialog>
  </div>
</template>
