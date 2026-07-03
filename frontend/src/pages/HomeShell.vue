<script setup>
// Home page — composes the sidebar + tile grid (+ empty state) + new-diagram
// dialog + trash view, and routes to the editor on create/open (spec §2).
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Dialog, FormControl } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import Sidebar from '@/components/home/Sidebar.vue'
import TileGrid from '@/components/home/TileGrid.vue'
import EmptyState from '@/components/home/EmptyState.vue'
import TrashView from '@/components/home/TrashView.vue'
import NewDiagramDialog from '@/components/home/NewDiagramDialog.vue'
import { diagrams, createDiagram } from '@/data/diagrams.js'
import { folders, createFolder } from '@/data/folders.js'

const router = useRouter()
const view = ref('home')
const folderPath = ref([]) // ancestor chain of open folders (root → current)
const showNewDiagram = ref(false)

// New folder — created in the current location (nested under the open folder).
// Lifted here from the tile grid so it's a header CTA next to "New diagram".
const newFolder = reactive({ open: false, value: '' })
function openNewFolder() {
  newFolder.value = ''
  newFolder.open = true
}
async function saveNewFolder() {
  const name = newFolder.value.trim()
  if (name) await createFolder(name, currentFolder.value?.name || null)
  newFolder.open = false
}

onMounted(() => {
  diagrams.fetch()
  folders.fetch()
})

const list = computed(() => diagrams.data || [])
const isEmpty = computed(() => list.value.length === 0)
const currentFolder = computed(() => folderPath.value[folderPath.value.length - 1] || null)

const VIEW_TITLES = { home: 'Home', recent: 'Recent', all: 'All diagrams' }
const title = computed(() => VIEW_TITLES[view.value] || 'Home')

// Switching sidebar views always returns to the folder root.
function navigate(next) {
  view.value = next
  folderPath.value = []
}

function openFolder(folder) {
  folderPath.value = [...folderPath.value, folder]
}

// Jump to a breadcrumb crumb: -1 = Home (root), else truncate the path there.
function crumbTo(index) {
  folderPath.value = index < 0 ? [] : folderPath.value.slice(0, index + 1)
}

// Guard against double-submission: a fast double-click (or a stray double event)
// on "New diagram" would otherwise fire create() twice and insert two diagrams.
const isCreating = ref(false)
async function create(payload = {}) {
  if (isCreating.value) return
  isCreating.value = true
  try {
    const name = await createDiagram(payload.title, payload.document, payload.type || 'block')
    if (!name) throw new Error('Server returned no diagram name')
    diagrams.reload()
    // A new diagram lands directly on its blank canvas; `new` selects the title
    // for inline renaming.
    router.push({ name: 'Editor', params: { name }, query: { new: '1' } })
  } catch (error) {
    // Surface the real reason instead of failing silently (toasts aren't mounted).
    const detail = error?.messages?.join('\n') || error?.exc_type || error?.message || String(error)
    console.error('Create diagram failed:', error)
    window.alert('Could not create the diagram:\n\n' + detail)
  } finally {
    isCreating.value = false
  }
}

function open(name) {
  router.push({ name: 'Editor', params: { name } })
}
</script>

<template>
  <div class="flex h-screen">
    <Sidebar :active="view" @navigate="navigate" />

    <main class="min-h-0 flex-1 overflow-y-auto px-9 py-7">
      <TrashView v-if="view === 'trash'" />

      <template v-else>
        <div class="mb-6 flex items-center justify-between">
          <!-- Location breadcrumb (Home › Folder › Subfolder); view name elsewhere. -->
          <div class="flex items-center gap-1.5 text-[22px] font-bold text-ink-gray-9">
            <template v-if="view === 'home'">
              <button
                :class="folderPath.length ? 'text-ink-gray-5 hover:text-ink-gray-8' : ''"
                @click="crumbTo(-1)"
              >
                Home
              </button>
              <template v-for="(folder, index) in folderPath" :key="folder.name">
                <LucideIcon name="chevron-right" class="h-5 w-5 text-ink-gray-4" />
                <button
                  :class="index < folderPath.length - 1 ? 'text-ink-gray-5 hover:text-ink-gray-8' : ''"
                  @click="crumbTo(index)"
                >
                  {{ folder.folder_name || folder.name }}
                </button>
              </template>
            </template>
            <span v-else>{{ title }}</span>
          </div>
          <div class="flex items-center gap-2">
            <Button variant="outline" @click="openNewFolder">
              <template #prefix><LucideIcon name="folder-plus" class="h-4 w-4" /></template>
              New folder
            </Button>
            <Button variant="solid" @click="showNewDiagram = true">
              <template #prefix><LucideIcon name="plus" class="h-4 w-4" /></template>
              New diagram
            </Button>
          </div>
        </div>

        <EmptyState
          v-if="isEmpty"
          @create="create({ type: $event })"
          @new-folder="openNewFolder"
        />
        <TileGrid
          v-else
          :mode="view"
          :folder="currentFolder"
          @create="showNewDiagram = true"
          @open="open"
          @open-folder="openFolder"
        />
      </template>
    </main>

    <NewDiagramDialog v-model="showNewDiagram" @create="create" />

    <Dialog v-model="newFolder.open" :options="{ title: currentFolder ? `New folder in ${currentFolder.folder_name || currentFolder.name}` : 'New folder' }">
      <template #body-content>
        <FormControl type="text" label="Folder name" v-model="newFolder.value" @keydown.enter="saveNewFolder" />
      </template>
      <template #actions>
        <Button variant="solid" @click="saveNewFolder">Create folder</Button>
      </template>
    </Dialog>
  </div>
</template>
