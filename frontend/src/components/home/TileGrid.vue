<script setup>
// Diagram tile grid (spec §2, README "Home dashboard"): a dashed create tile
// first, then one DiagramTile per diagram, optionally grouped into folders. The
// ⋯ menu actions (rename / edit description / duplicate / delete→trash) and
// drag-into-folder are wired here through the shared Draw Diagram resources.
import { computed, onMounted, reactive } from 'vue'
import { createListResource, FeatherIcon, Dialog, Button, FormControl } from 'frappe-ui'
import DiagramTile from './DiagramTile.vue'
import FolderSection from './FolderSection.vue'
import { folders, moveDiagramToFolder } from '@/data/folders.js'
import { createDiagramDocument } from '@/diagram/schema.js'

const props = defineProps({
  diagrams: { type: Array, default: () => [] },
})
const emit = defineEmits(['create', 'open', 'changed'])

// Enriched list (adds document + folder) so tiles can render live previews and
// be grouped into folders without changing the shared home list resource.
const enriched = createListResource({
  doctype: 'Draw Diagram',
  fields: ['name', 'title', 'description', 'modified', 'folder', 'document'],
  filters: { is_trashed: 0 },
  orderBy: 'sort_order asc, modified desc',
  pageLength: 500,
})

onMounted(() => enriched.fetch())

const rows = computed(() => enriched.data || props.diagrams)

const unfiled = computed(() => rows.value.filter((diagram) => !diagram.folder))

const byFolder = computed(() =>
  (folders.data || []).map((folder) => ({
    folder,
    diagrams: rows.value.filter((diagram) => diagram.folder === folder.name),
  })),
)

// Inline rename / description editing through a small dialog.
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

// Delete moves the diagram to trash with no confirmation (trash is the net).
async function trash(diagram) {
  await enriched.setValue.submit({
    name: diagram.name,
    is_trashed: 1,
    trashed_on: frappeNow(),
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
    <div class="grid gap-[18px]" style="grid-template-columns: repeat(auto-fill, minmax(224px, 1fr))">
      <button
        class="flex h-[166px] flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-outline-gray-3 text-ink-gray-7 hover:bg-surface-gray-1"
        @click="emit('create')"
      >
        <div class="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-surface-gray-2">
          <FeatherIcon name="plus" class="h-5 w-5" />
        </div>
        <span class="text-[13px] font-semibold">New diagram</span>
      </button>

      <DiagramTile
        v-for="diagram in unfiled"
        :key="diagram.name"
        :diagram="diagram"
        @open="emit('open', $event)"
        @rename="startRename"
        @edit-description="startDescription"
        @duplicate="duplicate"
        @delete="trash"
      />
    </div>

    <FolderSection
      v-for="group in byFolder"
      :key="group.folder.name"
      :folder="group.folder"
      :diagrams="group.diagrams"
      @open="emit('open', $event)"
      @rename="startRename"
      @edit-description="startDescription"
      @duplicate="duplicate"
      @delete="trash"
      @drop-diagram="dropOnFolder(group.folder.name, $event)"
    />

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
