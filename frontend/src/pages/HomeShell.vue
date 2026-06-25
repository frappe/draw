<script setup>
// Home page — composes the sidebar + tile grid (+ empty state) + new-diagram
// dialog + trash view, and routes to the editor on create/open (spec §2).
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Button, FeatherIcon } from 'frappe-ui'
import Sidebar from '@/components/home/Sidebar.vue'
import TileGrid from '@/components/home/TileGrid.vue'
import EmptyState from '@/components/home/EmptyState.vue'
import TrashView from '@/components/home/TrashView.vue'
import NewDiagramDialog from '@/components/home/NewDiagramDialog.vue'
import { diagrams, createDiagram } from '@/data/diagrams.js'
import { folders } from '@/data/folders.js'

const router = useRouter()
const view = ref('home')
const currentFolder = ref(null) // open folder while drilled into Home
const showNewDiagram = ref(false)

onMounted(() => {
  diagrams.fetch()
  folders.fetch()
})

const list = computed(() => diagrams.data || [])
const isEmpty = computed(() => list.value.length === 0)

const VIEW_TITLES = { home: 'Home', recent: 'Recent', all: 'All diagrams' }
const title = computed(() => VIEW_TITLES[view.value] || 'Home')

// Switching sidebar views always returns to the folder root.
function navigate(next) {
  view.value = next
  currentFolder.value = null
}

async function create(payload = {}) {
  try {
    const name = await createDiagram(payload.title, payload.document, payload.type || 'block')
    if (!name) throw new Error('Server returned no diagram name')
    diagrams.reload()
    router.push({ name: 'Editor', params: { name } })
  } catch (error) {
    // Surface the real reason instead of failing silently (toasts aren't mounted).
    const detail = error?.messages?.join('\n') || error?.exc_type || error?.message || String(error)
    console.error('Create diagram failed:', error)
    window.alert('Could not create the diagram:\n\n' + detail)
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
          <!-- Location breadcrumb (Home › Folder); a view name elsewhere. -->
          <div class="flex items-center gap-1.5 text-[22px] font-bold text-ink-gray-9">
            <template v-if="view === 'home'">
              <button
                :class="currentFolder ? 'text-ink-gray-5 hover:text-ink-gray-8' : ''"
                @click="currentFolder = null"
              >
                Home
              </button>
              <template v-if="currentFolder">
                <FeatherIcon name="chevron-right" class="h-5 w-5 text-ink-gray-4" />
                <span>{{ currentFolder.folder_name || currentFolder.name }}</span>
              </template>
            </template>
            <span v-else>{{ title }}</span>
          </div>
          <Button variant="solid" @click="showNewDiagram = true">
            <template #prefix><FeatherIcon name="plus" class="h-4 w-4" /></template>
            Create
          </Button>
        </div>

        <EmptyState v-if="isEmpty" @create="showNewDiagram = true" />
        <TileGrid
          v-else
          :mode="view"
          :folder="currentFolder"
          @create="showNewDiagram = true"
          @open="open"
          @open-folder="currentFolder = $event"
        />
      </template>
    </main>

    <NewDiagramDialog v-model="showNewDiagram" @create="create" />
  </div>
</template>
